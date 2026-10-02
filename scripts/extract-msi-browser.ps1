param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
# Read one embedded installer resource without executing the MSI/custom action.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class BrowserMsiResource {
  [DllImport("msi.dll", CharSet=CharSet.Unicode, EntryPoint="MsiOpenDatabaseW")]
  static extern uint Open(string path, IntPtr mode, out uint handle);
  [DllImport("msi.dll", CharSet=CharSet.Unicode, EntryPoint="MsiDatabaseOpenViewW")]
  static extern uint View(uint db, string query, out uint handle);
  [DllImport("msi.dll", EntryPoint="MsiViewExecute")] static extern uint Execute(uint view, uint record);
  [DllImport("msi.dll", EntryPoint="MsiViewFetch")] static extern uint Fetch(uint view, out uint record);
  [DllImport("msi.dll", EntryPoint="MsiRecordReadStream")] static extern uint Read(uint record, uint field, byte[] buffer, ref uint length);
  [DllImport("msi.dll", EntryPoint="MsiCloseHandle")] static extern uint Close(uint handle);
  static void Check(uint result) { if(result != 0) throw new IOException("MSI read error " + result); }
  public static void Extract(string archive, string output) {
    uint db=0,view=0,record=0;
    try {
      Check(Open(archive,IntPtr.Zero,out db));
      Check(View(db,"SELECT `Data` FROM `_Streams` WHERE `Name`='Binary.MicrosoftEdgeInstaller'",out view));
      Check(Execute(view,0)); Check(Fetch(view,out record));
      using(var file=new FileStream(output,FileMode.CreateNew,FileAccess.Write)) {
        var buffer=new byte[1048576];
        while(true) { uint length=(uint)buffer.Length; Check(Read(record,1,buffer,ref length)); if(length==0)break; file.Write(buffer,0,(int)length); }
      }
    } finally { if(record!=0)Close(record); if(view!=0)Close(view); if(db!=0)Close(db); }
  }
}
'@
$archivePath=[System.IO.Path]::GetFullPath($Archive)
$outputPath=[System.IO.Path]::GetFullPath($Output)
$workspacePath=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))+[System.IO.Path]::DirectorySeparatorChar
if (!$outputPath.StartsWith($workspacePath,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Browser extraction output must stay in this workspace' }
[BrowserMsiResource]::Extract($archivePath,$outputPath)

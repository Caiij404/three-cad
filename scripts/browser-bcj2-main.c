/* Local test-tool wrapper; original public-domain Bcj2.c/h stay unmodified. */
#include <stdio.h>
#include <stdlib.h>
#include "Bcj2.h"
static unsigned read32(const unsigned char *p) {
  return (unsigned)p[0] | ((unsigned)p[1]<<8) | ((unsigned)p[2]<<16) | ((unsigned)p[3]<<24);
}
int main(int argc,char **argv) {
  if(argc!=3)return 1;
  FILE *input=fopen(argv[1],"rb"); if(!input)return 2;
  fseek(input,0,SEEK_END);long size=ftell(input);rewind(input);
  if(size<20||size>536870912)return 3;
  unsigned char *bytes=malloc((size_t)size);if(!bytes)return 4;
  if(fread(bytes,1,(size_t)size,input)!=(size_t)size)return 5;fclose(input);
  unsigned outputSize=read32(bytes);if(outputSize==0||outputSize>536870912)return 6;
  unsigned char *output=malloc(outputSize);if(!output)return 7;
  CBcj2Dec decoder;Bcj2Dec_Init(&decoder);size_t offset=20;
  for(unsigned i=0;i<4;i++) {
    unsigned length=read32(bytes+4+i*4);if(offset+length>(size_t)size)return 8;
    decoder.bufs[i]=bytes+offset;offset+=length;decoder.lims[i]=bytes+offset;
  }
  if(offset!=(size_t)size)return 9;
  decoder.dest=output;decoder.destLim=output+outputSize;
  if(Bcj2Dec_Decode(&decoder)!=SZ_OK||decoder.dest!=decoder.destLim)return 10;
  FILE *file=fopen(argv[2],"wb");if(!file)return 11;
  if(fwrite(output,1,outputSize,file)!=outputSize)return 12;
  fclose(file);free(bytes);free(output);return 0;
}

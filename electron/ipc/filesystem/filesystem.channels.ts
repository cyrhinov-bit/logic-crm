export const FS_CHANNELS = {
  GET_PATHS: 'fs:getPaths',
  READ_FILE: 'fs:readFile',
  WRITE_FILE: 'fs:writeFile',
  DELETE_FILE: 'fs:deleteFile',
  EXISTS: 'fs:exists',
  LIST_DIR: 'fs:listDir',
  CREATE_TEMP_FILE: 'fs:createTempFile',
  READ_BINARY_FILE: 'fs:readBinaryFile',
  WRITE_BINARY_FILE: 'fs:writeBinaryFile'
} as const;

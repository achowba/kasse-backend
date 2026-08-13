/**
 * The parts of an uploaded file this module uses.
 *
 * @remarks
 * Declared here rather than referring to `Express.Multer.File`. That type is an
 * ambient global augmentation which only applies once something imports `multer`,
 * and nothing here does: the upload is handled by Nest's `FileInterceptor`. A
 * dependency on an ambient global that may or may not be loaded is a build that
 * breaks depending on import order elsewhere.
 *
 * Naming the two fields actually read also documents the contract. The interceptor
 * is configured for memory storage, so `buffer` is populated and `path` is not.
 *
 * @property originalname - The name as the client sent it, kept for the user's own reference.
 * @property buffer - The file's bytes, in memory because the import validates the whole file before writing.
 */
export interface IUploadedFile {
  originalname: string;
  buffer: Buffer;
}

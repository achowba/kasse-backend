/**
 * Runtime environments the service recognises.
 *
 * @remarks
 * Behaviour keyed off this: documentation is not mounted in production, log
 * output is pretty printed only in development, and CORS is permissive in
 * development and test but strict everywhere else.
 */
export enum NodeEnvEnum {
  DEVELOPMENT = 'development',
  TEST = 'test',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

/**
 * API versions exposed through URI versioning.
 *
 * @remarks
 * A breaking change to a response shape adds a member here. It never mutates
 * an existing version in place.
 */
export enum ApiVersionEnum {
  V1 = '1',
}

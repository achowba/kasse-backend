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
 * Currencies an account can be denominated in.
 *
 * @remarks
 * ISO 4217 codes. An enum rather than a free string, so an unsupported code is
 * rejected at the API boundary and in the schema instead of being stored and
 * discovered later in a report.
 *
 * Every supported currency has two decimal places, which is what lets minor
 * units be a single shared concept. Adding a currency with a different exponent,
 * such as JPY with none or KWD with three, means teaching the money helpers
 * about exponents first.
 *
 * @property USD - United States dollar.
 * @property AED - United Arab Emirates dirham.
 */
export enum CurrencyEnum {
  USD = 'USD',
  AED = 'AED',
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

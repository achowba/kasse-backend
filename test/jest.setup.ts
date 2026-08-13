/*
 * Loaded before every test file.
 *
 * `class-validator` and `class-transformer` read decorator metadata through
 * `Reflect.getMetadata`, which only exists once this polyfill is imported. The
 * application gets it from the Nest bootstrap; a unit test that exercises a
 * decorated class directly does not, and fails with
 * "Reflect.getMetadata is not a function".
 */
import 'reflect-metadata';

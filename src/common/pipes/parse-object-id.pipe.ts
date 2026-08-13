import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Converts a path parameter into an ObjectId, rejecting anything malformed.
 *
 * @remarks
 * Without this a bad identifier reaches the database layer and surfaces as a
 * cast error, which is a 500 for what is really a bad request. Converting at the
 * boundary means a service can take an ObjectId and trust it.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, Types.ObjectId> {
  /**
   * Parses the value.
   *
   * @param value - The raw path parameter.
   * @returns The parsed identifier.
   * @throws BadRequestException When the value is not a valid ObjectId.
   */
  transform(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`"${value}" is not a valid identifier.`);
    }

    return new Types.ObjectId(value);
  }
}

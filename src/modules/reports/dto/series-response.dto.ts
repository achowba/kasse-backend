import { ApiProperty } from '@nestjs/swagger';
import { SeriesGroupByEnum } from '../reports.enums';

/**
 * One point of a chart series.
 *
 * @property key - The month, or the category id, this point is grouped under.
 * @property label - What to render on the axis.
 * @property planMinor - Planned, summed for this point.
 * @property actualMinor - Logged, summed for this point.
 * @property varianceMinor - Actual minus plan for this point.
 */
export class SeriesPointDTO {
  @ApiProperty({ description: 'The month, or the category id, this point is grouped under.', example: '2026-01' })
  key!: string;

  @ApiProperty({ description: 'What to render on the axis.', example: '2026-01' })
  label!: string;

  @ApiProperty({ description: 'Planned, summed for this point.', example: 2_500_000 })
  planMinor!: number;

  @ApiProperty({ description: 'Logged, summed for this point.', example: 2_530_000 })
  actualMinor!: number;

  @ApiProperty({ description: 'Actual minus plan for this point.', example: 30_000 })
  varianceMinor!: number;
}

/**
 * A chart series over the requested range.
 *
 * @remarks
 * Unpaginated. A chart needs every point in the range, and one built from a page
 * of table rows would draw a line that stops partway through the year.
 *
 * @property groupBy - Which axis the points are grouped on.
 * @property points - The points, in axis order.
 */
export class SeriesResponseDTO {
  @ApiProperty({ description: 'Which axis the points are grouped on.', enum: SeriesGroupByEnum })
  groupBy!: SeriesGroupByEnum;

  @ApiProperty({ description: 'The points, in axis order.', type: [SeriesPointDTO] })
  points!: SeriesPointDTO[];
}

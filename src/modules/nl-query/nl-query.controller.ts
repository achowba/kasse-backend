import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { RequestId } from '@common/request-context';
import { NlQueryDTO, NlQueryResponseDTO } from './dto/nl-query.dto';
import { NlQueryService } from './nl-query.service';

/**
 * Ask about spending in plain language.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'reports/nl-query', version: ApiVersionEnum.V1 })
export class NlQueryController {
  constructor(private readonly nlQueryService: NlQueryService) {}

  /**
   * Answers a question about spending.
   *
   * @param user - The authenticated caller.
   * @param input - The question.
   * @param requestId - The request making the query.
   * @returns The filter the question was read as, and the report it produced.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask about spending in plain language',
    description: `Turns a question such as "how did marketing do in Q1 2026" into a report filter, runs it, and returns both.

**The model never writes a query.** It is given exactly one tool whose schema is a report filter: a month range, some category names, and a policy. It cannot express a collection, a field, an operator, or a database, it never sees a connection string, and the names it may choose from are this account's own categories. Whatever it returns is then validated by the same DTO a hand written report request goes through, and executed by the same report service.

That means this endpoint cannot reach anything \`GET /reports/plan-vs-actual\` could not, whatever the model returns. A model that answers with nonsense produces a validation error, not a query.

**The filter comes back with the data.** A user has to be able to see that "last quarter" was read as the months they meant, and an answer with no visible interpretation is one the reader has to trust blindly.

Returns \`503\` when the deployment has no \`ANTHROPIC_API_KEY\`, and \`502\` when the model is unreachable or does not produce a usable filter. Every other endpoint works either way, so the report is always available directly.`,
  })
  @ApiOkResponse({ description: 'The filter and the report it produced.', type: NlQueryResponseDTO })
  @ApiBadGatewayResponse({
    description: 'The model was unreachable or did not return a usable filter.',
    type: ErrorResponseDTO,
  })
  @ApiServiceUnavailableResponse({
    description: 'This deployment has no API key configured, so the endpoint is switched off.',
    type: ErrorResponseDTO,
  })
  async ask(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() input: NlQueryDTO,
    @RequestId() requestId?: string,
  ): Promise<NlQueryResponseDTO> {
    return await this.nlQueryService.ask(user.userId, input.question, requestId);
  }
}

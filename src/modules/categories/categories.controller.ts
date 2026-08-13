import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { ApiPaginatedResponse, IPaginatedResponse } from '@common/pagination';
import { ParseObjectIdPipe } from '@common/pipes';
import { RequestId } from '@common/request-context';
import { CategoriesService } from './categories.service';
import { CategoryResponseDTO } from './dto/category-response.dto';
import { CreateCategoryDTO } from './dto/create-category.dto';
import { ListCategoriesQueryDTO } from './dto/list-categories.query.dto';
import { UpdateCategoryDTO } from './dto/update-category.dto';

/**
 * Spending categories.
 *
 * @remarks
 * Two kinds are visible to a caller: the shared catalogue, which every account
 * can select and none can change, and the caller's own categories.
 */
@ApiTags('Categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'categories', version: ApiVersionEnum.V1 })
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * Lists the categories the caller can select.
   *
   * @param user - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The categories, sorted by name.
   */
  @Get()
  @ApiOperation({
    summary: 'List selectable categories',
    description: `Returns the caller's own categories together with the shared catalogue, sorted by name.

Each entry reports whether it is \`shared\`. A shared category can be selected by any account but cannot be renamed, archived, or deleted, so a client should not offer those actions for it.

Archived categories are excluded by default, because a picker wants only what can be chosen now. Pass \`includeArchived=true\` to see them; they still resolve in existing plans, expenses, and reports.`,
  })
  @ApiPaginatedResponse(CategoryResponseDTO, 'A page of selectable categories.')
  async list(
    @CurrentUser() user: IAuthenticatedUser,
    @Query() query: ListCategoriesQueryDTO,
  ): Promise<IPaginatedResponse<CategoryResponseDTO>> {
    return await this.categoriesService.list(user.userId, query);
  }

  /**
   * Creates a category owned by the caller.
   *
   * @param user - The authenticated caller.
   * @param input - The name to create.
   * @param requestId - The request making the change.
   * @returns The created category.
   */
  @Post()
  @ApiOperation({
    summary: 'Create a category',
    description: `Creates a category owned by the caller, alongside the shared catalogue.

Names are compared case and spacing insensitively, so "Cloud Hosting" and "cloud  hosting" collide and the second is rejected. Without that, a picker ends up showing what looks like the same category twice and a report splits the same spend across both.

Creating a category with the same name as a shared one is allowed. The account's own category takes precedence when a CSV import resolves that name.`,
  })
  @ApiCreatedResponse({ description: 'The category was created.', type: CategoryResponseDTO })
  @ApiConflictResponse({ description: 'The caller already has a category with that name.', type: ErrorResponseDTO })
  async create(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() input: CreateCategoryDTO,
    @RequestId() requestId?: string,
  ): Promise<CategoryResponseDTO> {
    const category = await this.categoriesService.create(user.userId, input, requestId);

    return CategoryResponseDTO.fromDocument(category);
  }

  /**
   * Renames or archives a category the caller owns.
   *
   * @param user - The authenticated caller.
   * @param categoryId - The category to change.
   * @param changes - The fields to change.
   * @param requestId - The request making the change.
   * @returns The updated category.
   */
  @Patch(':categoryId')
  @ApiParam({ name: 'categoryId', description: 'Identifier from the category list.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @ApiOperation({
    summary: 'Rename or archive a category',
    description: `Changes the name, the archived state, or both. Anything omitted is left alone.

Only the caller's own categories can be changed. A shared catalogue entry answers 404 rather than explaining the rule, because a client should already know from the \`shared\` flag and there is nothing useful to reveal.

Archiving hides a category from pickers without affecting anything historic: existing plans and expenses keep resolving it and reports are unchanged. It is almost always what someone wants instead of deleting.`,
  })
  @ApiOkResponse({ description: 'The updated category.', type: CategoryResponseDTO })
  @ApiNotFoundResponse({ description: 'The caller does not own a category with that id.', type: ErrorResponseDTO })
  @ApiConflictResponse({ description: 'The new name collides with another of the caller’s categories.', type: ErrorResponseDTO })
  async update(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('categoryId', ParseObjectIdPipe) categoryId: Types.ObjectId,
    @Body() changes: UpdateCategoryDTO,
    @RequestId() requestId?: string,
  ): Promise<CategoryResponseDTO> {
    const category = await this.categoriesService.update(user.userId, categoryId, changes, requestId);

    return CategoryResponseDTO.fromDocument(category);
  }

  /**
   * Deletes a category the caller owns.
   *
   * @param user - The authenticated caller.
   * @param categoryId - The category to delete.
   * @param requestId - The request making the change.
   */
  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'categoryId', description: 'Identifier from the category list.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @ApiOperation({
    summary: 'Delete a category',
    description: `Removes a category the caller owns from every list.

The delete is soft. The record survives so that plans and expenses in a locked period keep resolving the name they referenced, and so a mistaken delete is recoverable without a database restore. The change is recorded in the audit log with the category's last state.

Consider archiving instead. Deleting a category that already has spend against it makes those records harder to read, while archiving hides it from pickers and leaves history intact.

A shared catalogue entry answers 404.`,
  })
  @ApiNoContentResponse({ description: 'The category was deleted.' })
  @ApiNotFoundResponse({ description: 'The caller does not own a category with that id.', type: ErrorResponseDTO })
  async remove(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('categoryId', ParseObjectIdPipe) categoryId: Types.ObjectId,
    @RequestId() requestId?: string,
  ): Promise<void> {
    await this.categoriesService.remove(user.userId, categoryId, requestId);
  }
}

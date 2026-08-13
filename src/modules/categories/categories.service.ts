import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Types } from 'mongoose';
import { DUPLICATE_KEY_ERROR } from '@common/database';
import { IPaginatedResponse, toPaginatedResponse } from '@common/pagination';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesRepository } from './categories.repository';
import { toCategorySlug } from './categories.util';
import { CATEGORY_CATALOGUE } from './category-catalogue';
import { CategoryResponseDTO } from './dto/category-response.dto';
import { CreateCategoryDTO } from './dto/create-category.dto';
import { ListCategoriesQueryDTO } from './dto/list-categories.query.dto';
import { UpdateCategoryDTO } from './dto/update-category.dto';
import { CategoryDocument } from './schemas/category.schema';

/**
 * Categories a user can plan and log spend against.
 *
 * @remarks
 * Two kinds. The shared catalogue has no owner and is readable by every account
 * but editable by none. A user's own categories sit alongside it and are theirs
 * to rename, archive, or delete.
 */
@Injectable()
export class CategoriesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Seeds the shared catalogue when it is missing.
   *
   * @remarks
   * Runs at boot so a fresh database is never empty and nobody has to remember a
   * setup step. Idempotent twice over: it skips when the catalogue is already
   * present, and the unique index makes a concurrent seed from another instance a
   * duplicate key error rather than a duplicate row.
   */
  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.categoriesRepository.countShared();

    if (existing >= CATEGORY_CATALOGUE.length) {
      return;
    }

    let seeded = 0;

    for (const name of CATEGORY_CATALOGUE) {
      try {
        await this.categoriesRepository.create(null, name, toCategorySlug(name));
        seeded += 1;
      } catch (error) {
        if (!this.isDuplicateKey(error)) {
          throw error;
        }
      }
    }

    this.logger.log({ seeded, total: CATEGORY_CATALOGUE.length }, 'shared category catalogue ready');
  }

  /**
   * Lists what the caller can select from: their own categories and the shared catalogue.
   *
   * @param userId - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The categories, sorted by name.
   */
  async list(userId: Types.ObjectId, query: ListCategoriesQueryDTO): Promise<IPaginatedResponse<CategoryResponseDTO>> {
    const { categories, total } = await this.categoriesRepository.listVisible(
      userId,
      query.includeArchived ?? false,
      query.limit,
      query.offset,
    );

    return toPaginatedResponse(
      categories.map((category) => CategoryResponseDTO.fromDocument(category)),
      total,
      query,
    );
  }

  /**
   * Reads a category the caller can select.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @returns The category.
   * @throws NotFoundException When neither the account nor the catalogue has it.
   */
  async getVisibleById(userId: Types.ObjectId, id: Types.ObjectId): Promise<CategoryDocument> {
    const category = await this.categoriesRepository.findVisibleById(userId, id);

    if (category === null) {
      throw new NotFoundException('Category not found.');
    }

    return category;
  }

  /**
   * Resolves a name to a selectable category.
   *
   * @remarks
   * Used by the CSV import, where a row names a category rather than identifying
   * it. Matching is on the normalised key, so capitalisation and spacing in a
   * spreadsheet cell do not matter.
   *
   * @param userId - The authenticated caller.
   * @param name - The name as written.
   * @returns The category, or null when neither the account nor the catalogue has it.
   */
  async resolveByName(userId: Types.ObjectId, name: string): Promise<CategoryDocument | null> {
    return await this.categoriesRepository.findVisibleBySlug(userId, toCategorySlug(name));
  }

  /**
   * Creates a category owned by the caller.
   *
   * @param userId - The authenticated caller.
   * @param input - The name to create.
   * @param requestId - The request making the change.
   * @returns The created category.
   * @throws ConflictException When the caller already has a category with that name.
   */
  async create(userId: Types.ObjectId, input: CreateCategoryDTO, requestId?: string): Promise<CategoryDocument> {
    const slug = toCategorySlug(input.name);

    if (slug === '') {
      throw new ConflictException('A category name must contain at least one letter or number.');
    }

    if (await this.categoriesRepository.ownsSlug(userId, slug)) {
      throw new ConflictException('You already have a category with that name.');
    }

    const category = await this.categoriesRepository.create(userId, input.name.trim(), slug);

    await this.auditLogService.record({
      userId,
      action: AuditActionEnum.CATEGORY_CREATED,
      entity: AuditEntityEnum.CATEGORY,
      entityId: category._id,
      after: { name: category.name },
      requestId,
    });

    return category;
  }

  /**
   * Renames or archives a category the caller owns.
   *
   * @remarks
   * Shared catalogue entries are not editable, and are not found here at all,
   * so an attempt to rename one answers 404 rather than explaining the rule.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @param changes - The fields to change.
   * @param requestId - The request making the change.
   * @returns The updated category.
   * @throws NotFoundException When the caller does not own a category with that id.
   * @throws ConflictException When the new name collides with another of their categories.
   */
  async update(
    userId: Types.ObjectId,
    id: Types.ObjectId,
    changes: UpdateCategoryDTO,
    requestId?: string,
  ): Promise<CategoryDocument> {
    const existing = await this.categoriesRepository.findOwnedById(userId, id);

    if (existing === null) {
      throw new NotFoundException('Category not found.');
    }

    const update: Partial<{ name: string; slug: string; archivedAt: Date | null }> = {};

    if (changes.name !== undefined) {
      const slug = toCategorySlug(changes.name);

      if (slug !== existing.slug && (await this.categoriesRepository.ownsSlug(userId, slug))) {
        throw new ConflictException('You already have a category with that name.');
      }

      update.name = changes.name.trim();
      update.slug = slug;
    }

    if (changes.archived !== undefined) {
      update.archivedAt = changes.archived ? new Date() : null;
    }

    const updated = await this.categoriesRepository.update(userId, id, update);

    if (updated === null) {
      throw new NotFoundException('Category not found.');
    }

    await this.auditLogService.record({
      userId,
      action: AuditActionEnum.CATEGORY_UPDATED,
      entity: AuditEntityEnum.CATEGORY,
      entityId: id,
      before: { name: existing.name, archived: existing.archivedAt !== null },
      after: { name: updated.name, archived: updated.archivedAt !== null },
      requestId,
    });

    return updated;
  }

  /**
   * Soft deletes a category the caller owns.
   *
   * @remarks
   * The record survives, so plans and actuals in a locked period keep resolving
   * the name they referenced. Archiving is the gentler option and is what a user
   * usually wants: it hides the category from pickers while leaving it selectable
   * in history.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @param requestId - The request making the change.
   * @throws NotFoundException When the caller does not own a category with that id.
   */
  async remove(userId: Types.ObjectId, id: Types.ObjectId, requestId?: string): Promise<void> {
    const existing = await this.categoriesRepository.findOwnedById(userId, id);

    if (existing === null) {
      throw new NotFoundException('Category not found.');
    }

    await this.categoriesRepository.softDelete(userId, id);

    await this.auditLogService.record({
      userId,
      action: AuditActionEnum.CATEGORY_DELETED,
      entity: AuditEntityEnum.CATEGORY,
      entityId: id,
      before: { name: existing.name, archived: existing.archivedAt !== null },
      requestId,
    });
  }

  /**
   * Reports whether an error is a unique index violation.
   *
   * @param error - The thrown value.
   * @returns True when MongoDB rejected the write as a duplicate.
   */
  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY_ERROR;
  }
}

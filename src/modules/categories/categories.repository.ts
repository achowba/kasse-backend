import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, QueryFilter, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';

/**
 * Data access for categories.
 *
 * @remarks
 * Does not extend {@link BaseTenantRepository}, because a category may have no
 * owner. Every read here is scoped to "mine or shared" rather than "mine", which
 * the tenant scoped base cannot express, and every read still excludes soft
 * deleted rows.
 *
 * The two scoping helpers are private and used by every method, so the rules are
 * applied in one place for the same reason the base class exists.
 */
@Injectable()
export class CategoriesRepository {
  constructor(@InjectModel(Category.name) private readonly model: Model<Category>) {}

  /**
   * Matches a user's own categories and the shared catalogue.
   *
   * @param userId - The authenticated caller.
   * @param filter - Extra conditions.
   * @returns The filter, scoped to what this caller may see.
   */
  private visibleTo(userId: Types.ObjectId, filter: QueryFilter<Category> = {}): QueryFilter<Category> {
    return { ...filter, deletedAt: null, $or: [{ userId }, { userId: null }] };
  }

  /**
   * Matches only what a user owns, which is the only thing they may change.
   *
   * @param userId - The authenticated caller.
   * @param filter - Extra conditions.
   * @returns The filter, scoped to this caller's own categories.
   */
  private ownedBy(userId: Types.ObjectId, filter: QueryFilter<Category> = {}): QueryFilter<Category> {
    return { ...filter, userId, deletedAt: null };
  }

  /**
   * Lists what a caller can select from.
   *
   * @param userId - The authenticated caller.
   * @param includeArchived - Whether to include categories hidden from pickers.
   * @param limit - How many to return.
   * @param offset - How many to skip.
   * @returns The categories and the total matching.
   */
  async listVisible(
    userId: Types.ObjectId,
    includeArchived: boolean,
    limit: number,
    offset: number,
  ): Promise<{ categories: CategoryDocument[]; total: number }> {
    const filter = this.visibleTo(userId, includeArchived ? {} : { archivedAt: null });

    const [categories, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip(offset).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { categories, total };
  }

  /**
   * Finds a category the caller can select, own or shared.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @returns The category, or null when there is none they can see.
   */
  async findVisibleById(userId: Types.ObjectId, id: Types.ObjectId): Promise<CategoryDocument | null> {
    return await this.model.findOne(this.visibleTo(userId, { _id: id })).exec();
  }

  /**
   * Finds a selectable category by name.
   *
   * @remarks
   * Matches on the slug, so capitalisation and spacing in a CSV cell do not
   * matter. A user's own category wins over a shared one with the same name,
   * which is what someone who deliberately created their own would expect.
   *
   * @param userId - The authenticated caller.
   * @param slug - The normalised name.
   * @returns The category, or null when neither the account nor the catalogue has it.
   */
  async findVisibleBySlug(userId: Types.ObjectId, slug: string): Promise<CategoryDocument | null> {
    const matches = await this.model.find(this.visibleTo(userId, { slug })).exec();

    return matches.find((category) => category.userId !== null) ?? matches[0] ?? null;
  }

  /**
   * Finds a category the caller owns, which is the only kind they may change.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @returns The category, or null when they do not own one with that id.
   */
  async findOwnedById(userId: Types.ObjectId, id: Types.ObjectId): Promise<CategoryDocument | null> {
    return await this.model.findOne(this.ownedBy(userId, { _id: id })).exec();
  }

  /**
   * Reports whether the caller already has a live category with this key.
   *
   * @param userId - The authenticated caller.
   * @param slug - The normalised name.
   * @returns True when they already have one.
   */
  async ownsSlug(userId: Types.ObjectId, slug: string): Promise<boolean> {
    return (await this.model.exists(this.ownedBy(userId, { slug }))) !== null;
  }

  /**
   * Creates a category owned by the caller.
   *
   * @param userId - The owning account, or null to seed a shared catalogue entry.
   * @param name - The name as written.
   * @param slug - The normalised key.
   * @param session - Optional transaction session.
   * @returns The created category.
   */
  async create(userId: Types.ObjectId | null, name: string, slug: string, session?: ClientSession): Promise<CategoryDocument> {
    const category = new this.model({ userId, name, slug, archivedAt: null, deletedAt: null });

    return await category.save({ session });
  }

  /**
   * Updates a category the caller owns.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @param changes - The fields to change.
   * @returns The updated category, or null when they do not own one with that id.
   */
  async update(
    userId: Types.ObjectId,
    id: Types.ObjectId,
    changes: Partial<Pick<Category, 'name' | 'slug' | 'archivedAt'>>,
  ): Promise<CategoryDocument | null> {
    return await this.model
      .findOneAndUpdate(this.ownedBy(userId, { _id: id }), { $set: changes }, { new: true, runValidators: true })
      .exec();
  }

  /**
   * Soft deletes a category the caller owns.
   *
   * @param userId - The authenticated caller.
   * @param id - The category identifier.
   * @returns True when a live category was deleted.
   */
  async softDelete(userId: Types.ObjectId, id: Types.ObjectId): Promise<boolean> {
    const result = await this.model.updateOne(this.ownedBy(userId, { _id: id }), { $set: { deletedAt: new Date() } }).exec();

    return result.modifiedCount > 0;
  }

  /**
   * Reports whether the shared catalogue has been seeded.
   *
   * @returns How many shared categories exist.
   */
  async countShared(): Promise<number> {
    return await this.model.countDocuments({ userId: null, deletedAt: null }).exec();
  }
}

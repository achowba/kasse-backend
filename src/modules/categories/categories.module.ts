import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '@modules/audit-log';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { Category, CategorySchema } from './schemas/category.schema';

/**
 * Spending categories: the shared catalogue and each account's own.
 *
 * @remarks
 * Exports {@link CategoriesService} because plans, expenses, and the CSV import
 * all need to resolve a category and confirm the caller may use it.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Category.name, schema: CategorySchema }]), AuditLogModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesRepository],
  exports: [CategoriesService],
})
export class CategoriesModule {}

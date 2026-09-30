import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Absolute ceiling enforced by DTO validation. */
export const ABSOLUTE_MAX_PAGE_SIZE = 500;

export const SortOrder = { ASC: 'asc', DESC: 'desc' } as const;
export type SortOrderValue = (typeof SortOrder)[keyof typeof SortOrder];

/**
 * Offset pagination shared by every list endpoint.
 *
 * The effective maximum page size is `min(ABSOLUTE_MAX_PAGE_SIZE, MAX_PAGE_SIZE)`
 * — the environment can only make it stricter, never looser.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: '1-based page number.' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ABSOLUTE_MAX_PAGE_SIZE,
    description: 'Items per page. Defaults to DEFAULT_PAGE_SIZE, capped by MAX_PAGE_SIZE.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ABSOLUTE_MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ enum: Object.values(SortOrder), default: SortOrder.DESC })
  @IsOptional()
  @IsIn(Object.values(SortOrder))
  sortOrder?: SortOrderValue;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  limit!: number;

  @ApiProperty({ example: 137 })
  totalItems!: number;

  @ApiProperty({ example: 6 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

/** Shape returned by every paginated endpoint inside the `data` envelope field. */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMetaDto;
}

export interface ResolvedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/**
 * Applies defaults and the configured ceiling to a pagination query.
 *
 * Centralised so no endpoint can accidentally accept an unbounded `limit`.
 */
export function resolvePagination(
  query: PaginationQueryDto | undefined,
  limits: { defaultPageSize: number; maxPageSize: number },
): ResolvedPagination {
  const effectiveMax = Math.min(limits.maxPageSize, ABSOLUTE_MAX_PAGE_SIZE);
  const page = Math.max(1, query?.page ?? 1);
  const limit = Math.min(Math.max(1, query?.limit ?? limits.defaultPageSize), effectiveMax);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildPaginationMeta(
  pagination: ResolvedPagination,
  totalItems: number,
): PaginationMetaDto {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pagination.limit);
  return {
    page: pagination.page,
    limit: pagination.limit,
    totalItems,
    totalPages,
    hasNextPage: pagination.page < totalPages,
    hasPreviousPage: pagination.page > 1 && totalItems > 0,
  };
}

export function paginated<T>(
  items: T[],
  pagination: ResolvedPagination,
  totalItems: number,
): PaginatedResult<T> {
  return { items, pagination: buildPaginationMeta(pagination, totalItems) };
}

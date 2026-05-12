import { Prisma } from '@prisma/client';

export function isPrismaKnownRequestError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

export function getPrismaUniqueTargets(
  error: Prisma.PrismaClientKnownRequestError,
): string[] {
  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.map((item) => String(item).toLowerCase());
  }

  if (typeof target === 'string') {
    return [target.toLowerCase()];
  }

  return [];
}

export function hasUniqueTarget(
  error: Prisma.PrismaClientKnownRequestError,
  ...keywords: string[]
) {
  const targets = getPrismaUniqueTargets(error);
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());

  return normalizedKeywords.some((keyword) =>
    targets.some((target) => target.includes(keyword)),
  );
}

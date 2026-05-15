export const ARTICLE_STATUS = {
  UNREAD: 'Unread',
  READ: 'Read',
} as const;

export type ArticleStatus =
  (typeof ARTICLE_STATUS)[keyof typeof ARTICLE_STATUS];

# Database-owned public gallery navigation

Public gallery categories and their hierarchy are owned by the database and managed through Admin, rather than duplicated in `Header.tsx`. The public menu reads only navigation-enabled categories that contain at least one published album, so category renames, hierarchy changes, and album publication cannot leave hard-coded links pointing at missing album routes. Runtime URLs keep albums at `/thu-vien/{albumSlug}` and place categories under `/thu-vien/danh-muc/{categorySlug}` to make the two concepts unambiguous.

# Album Detail Stats Layout Design

**Date:** 2026-07-27  
**Status:** Approved visually (option A)

## Goal

Make the album-detail metadata semantically correct and compact:

- the image count uses an image icon;
- the view count uses an eye icon;
- the decorative bullet between the two values is removed;
- both values stay on one row when space allows and wrap as complete items when the row becomes narrow.

## Scope

Update only the public album-detail header in `AlbumDetailClient.tsx`. Album cards, admin pages, API responses, count formatting, and PhotoSwipe behavior remain unchanged.

## Layout

The stats container remains below the shoot date and keeps its existing top border, muted color, and responsive text sizing. It becomes a wrapping flex row with separate horizontal and vertical gaps. Each stat remains an `inline-flex`, non-breaking item so an icon never separates from its label.

```text
[image icon] 7 ảnh    [eye icon] 111 lượt xem
```

On narrow widths, wrapping may produce:

```text
[image icon] 7 ảnh
[eye icon] 111 lượt xem
```

There is no dot, bullet, or other separator.

## Icon semantics

Use Lucide's image icon for `album.imageCount` and retain Lucide's eye icon for `album.viewCount`. Both icons use the existing 14 px mobile and 16 px medium-screen sizing so the visual weight stays aligned with the shoot-date metadata.

## Verification

Add a focused source-contract regression test that verifies the album-detail stats markup includes the image and eye icons, uses wrapping layout, and no longer renders the bullet separator. Run the focused test, frontend TypeScript check, Prettier check, and whitespace diff check.

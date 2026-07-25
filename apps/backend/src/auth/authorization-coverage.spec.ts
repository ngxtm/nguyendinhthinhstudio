import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AlbumsController } from '../albums/albums.controller';
import { ImagesController } from '../images/images.controller';
import { CategoriesController } from '../categories/categories.controller';
import { TagsController } from '../tags/tags.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';

type ControllerClass = { prototype: object; name: string };

const contracts: Array<{
  controller: ControllerClass;
  public: string[];
  admin: string[];
}> = [
  {
    controller: AlbumsController,
    public: ['findAll', 'findOne', 'getRelated', 'recordView'],
    admin: [
      'create',
      'getDashboardStats',
      'findAdminAll',
      'findAdminById',
      'findAdminBySlug',
      'update',
      'remove',
      'setCover',
      'publish',
      'toggleFeatured',
    ],
  },
  {
    controller: ImagesController,
    public: ['findByAlbum'],
    admin: ['getUploadUrl', 'confirmUpload', 'update', 'remove', 'reorder'],
  },
  {
    controller: CategoriesController,
    public: ['findAll', 'findOne'],
    admin: ['create', 'update', 'remove', 'checkUsage', 'bulkRemoveFromAlbums'],
  },
  {
    controller: TagsController,
    public: ['findAll', 'findOne', 'findAlbumsByTag'],
    admin: ['create', 'update', 'remove', 'checkUsage', 'bulkRemoveFromAlbums'],
  },
];

describe('administrator authorization coverage', () => {
  it.each(contracts)('$controller.name activates both auth guards', ({ controller }) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it.each(contracts)('$controller.name explicitly classifies each route', ({ controller, public: publicRoutes, admin }) => {
    for (const methodName of publicRoutes) {
      const method = (controller.prototype as Record<string, unknown>)[methodName];
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, method)).toBe(true);
      expect(Reflect.getMetadata(ROLES_KEY, method)).toBeUndefined();
    }
    for (const methodName of admin) {
      const method = (controller.prototype as Record<string, unknown>)[methodName];
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, method)).not.toBe(true);
      expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual(['admin']);
    }
  });
});

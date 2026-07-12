import { ImagesController } from './images.controller';

describe('ImagesController', () => {
  it('does not expose the mock upload endpoint', () => {
    expect('mockUpload' in ImagesController.prototype).toBe(false);
  });
});

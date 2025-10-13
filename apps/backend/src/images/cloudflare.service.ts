import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';

export interface CloudflareUploadResponse {
  uploadURL: string;
  id: string;
}

export interface CloudflareImageMetadata {
  id: string;
  filename: string;
  uploaded: string;
  requireSignedURLs: boolean;
  variants: string[];
}

@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly useMockUpload: boolean;

  constructor(private configService: ConfigService) {
    this.accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    this.apiToken = this.configService.get<string>('CLOUDFLARE_IMAGES_TOKEN');
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images`;
    this.useMockUpload = this.configService.get<string>('USE_MOCK_UPLOAD') === 'true';

    // Debug logging
    this.logger.log(`Cloudflare Config:
      - Account ID: ${this.accountId}
      - Token: ${this.apiToken ? this.apiToken.substring(0, 10) + '...' : 'NOT SET'}
      - Base URL: ${this.baseUrl}
      - Mock Upload: ${this.useMockUpload}
    `);

    if (!this.accountId || !this.apiToken) {
      this.logger.warn('⚠️  Cloudflare credentials not configured properly');
    }

    if (this.useMockUpload) {
      this.logger.log('🔧 Using MOCK upload mode for development');
    }
  }

  /**
   * Get a direct upload URL for uploading images
   * @param metadata Optional metadata to attach to the image
   * @returns Upload URL and upload ID
   */
  async getDirectUploadUrl(metadata?: Record<string, string>): Promise<CloudflareUploadResponse> {
    // Development mode: return mock URL
    if (this.useMockUpload) {
      const mockId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.logger.log(`📸 Generated mock upload URL for: ${metadata?.filename || 'unknown'}`);

      return {
        uploadURL: `http://localhost:${this.configService.get('PORT', 3000)}/images/mock-upload/${mockId}`,
        id: mockId,
      };
    }

    // Production mode: use actual Cloudflare API with axios
    try {
      // Cloudflare requires form-data, not JSON
      const formData = new FormData();
      formData.append('requireSignedURLs', 'false');

      if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      this.logger.log('Requesting upload URL from Cloudflare...');

      const response = await axios.post(
        `${this.baseUrl}/v2/direct_upload`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            ...formData.getHeaders(),
          },
        }
      );

      if (response.data.success) {
        this.logger.log(`Upload URL generated: ${response.data.result.id}`);
        return {
          uploadURL: response.data.result.uploadURL,
          id: response.data.result.id,
        };
      } else {
        const errors = response.data.errors || [];
        this.logger.error(`Cloudflare API errors: ${JSON.stringify(errors, null, 2)}`);
        throw new InternalServerErrorException('Failed to get upload URL from Cloudflare');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        this.logger.error(`Cloudflare API error response: ${JSON.stringify(errorData, null, 2)}`);
        this.logger.error(`Status: ${error.response?.status}, Message: ${error.message}`);
      } else {
        this.logger.error(`Error getting direct upload URL: ${JSON.stringify(error, null, 2)}`);
      }
      throw new InternalServerErrorException('Failed to get upload URL');
    }
  }

  /**
   * Delete an image from Cloudflare
   * @param imageId Cloudflare image ID
   */
  async deleteImage(imageId: string): Promise<void> {
    // Development mode: just log
    if (this.useMockUpload || imageId.startsWith('mock-')) {
      this.logger.log(`🗑️  Mock delete image: ${imageId}`);
      return;
    }

    // Production mode: actual deletion with axios
    try {
      const response = await axios.delete(`${this.baseUrl}/v1/${imageId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (response.data.success) {
        this.logger.log(`Successfully deleted image ${imageId}`);
      } else {
        const errors = response.data.errors || [];
        this.logger.error(`Failed to delete image ${imageId}: ${JSON.stringify(errors)}`);
        throw new InternalServerErrorException('Failed to delete image from Cloudflare');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Error deleting image ${imageId}: ${error.response?.data || error.message}`);
      }
      throw new InternalServerErrorException('Failed to delete image');
    }
  }

  /**
   * Get image metadata from Cloudflare
   * @param imageId Cloudflare image ID
   */
  async getImageMetadata(imageId: string): Promise<CloudflareImageMetadata> {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/${imageId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (response.data.success) {
        return response.data.result;
      } else {
        const errors = response.data.errors || [];
        this.logger.error(`Failed to get image metadata ${imageId}: ${JSON.stringify(errors)}`);
        throw new InternalServerErrorException('Failed to get image metadata from Cloudflare');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Error getting image metadata ${imageId}: ${error.response?.data || error.message}`);
      }
      throw new InternalServerErrorException('Failed to get image metadata');
    }
  }

  /**
   * Generate variant URLs for different responsive sizes
   * @param imageId Cloudflare image ID
   * @returns Object with URLs for different sizes
   */
  getVariantUrls(imageId: string) {
    // Development mode: use placehold.co for reliable placeholder images
    if (this.useMockUpload || imageId.startsWith('mock-')) {
      // Use nice colors and text for development
      return {
        thumbnailUrl: `https://placehold.co/400x400/e2e8f0/64748b?text=Thumbnail`,
        smallUrl: `https://placehold.co/800x800/e2e8f0/64748b?text=Preview`,
        mediumUrl: `https://placehold.co/1200x1200/e2e8f0/64748b?text=Medium`,
        largeUrl: `https://placehold.co/1920x1920/e2e8f0/64748b?text=Large`,
        xlargeUrl: `https://placehold.co/2560x2560/e2e8f0/64748b?text=X-Large`,
        publicUrl: `https://placehold.co/1920x1920/e2e8f0/64748b?text=Full+Size`,
      };
    }

    // Production mode: actual Cloudflare URLs
    const hash = this.configService.get<string>('CLOUDFLARE_IMAGES_HASH');
    const baseUrl = `https://imagedelivery.net/${hash}`;

    // Use 'public' variant for all sizes (only variant that exists by default)
    // You can create custom variants in Cloudflare dashboard later
    return {
      thumbnailUrl: `${baseUrl}/${imageId}/public`,
      smallUrl: `${baseUrl}/${imageId}/public`,
      mediumUrl: `${baseUrl}/${imageId}/public`,
      largeUrl: `${baseUrl}/${imageId}/public`,
      xlargeUrl: `${baseUrl}/${imageId}/public`,
      publicUrl: `${baseUrl}/${imageId}/public`,
    };
  }

  /**
   * Verify webhook signature from Cloudflare (if configured)
   * @param signature Signature from webhook header
   * @param body Request body
   * @returns Whether signature is valid
   */
  verifyWebhookSignature(signature: string, body: string): boolean {
    // TODO: Implement HMAC verification if Cloudflare sends signatures
    // For now, we'll validate the structure of the webhook payload instead
    return true;
  }
}


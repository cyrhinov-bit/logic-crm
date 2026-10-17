import { useProductImages } from './ProductImagesContext';
import type { PosProduct } from '../../../context/AppContext';

interface ProductImageProps {
  product: PosProduct;
  size?: number;
  rounded?: boolean;
  style?: React.CSSProperties;
}

export default function ProductImage({ product, size = 40, rounded = true, style }: ProductImageProps) {
  const { getImageUrl } = useProductImages();
  const src = getImageUrl(product);
  const base: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: rounded ? 'var(--radius-sm)' : 0,
    ...style
  };

  if (!src) {
    return (
      <div
        style={{
          ...base,
          background: 'var(--color-surface-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 32 ? 18 : 12
        }}
      >
        <span>📷</span>
      </div>
    );
  }

  return <img src={src} alt={product.name} style={{ ...base, objectFit: 'cover' }} />;
}

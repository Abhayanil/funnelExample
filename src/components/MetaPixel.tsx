'use client';

import { useEffect } from 'react';
import { initMetaPixel } from '@/lib/telemetry/client';

export default function MetaPixel() {
  useEffect(() => {
    initMetaPixel(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  }, []);

  return null;
}

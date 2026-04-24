import { useState, useEffect } from 'react';

export function useDeviceType() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Use userAgentData if available (modern Chromium browsers)
      if ('userAgentData' in navigator && (navigator as any).userAgentData) {
        return (navigator as any).userAgentData.mobile;
      }
      // Fallback to userAgent string parsing
      const ua = navigator.userAgent;
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    };
    
    setIsMobile(checkMobile());
  }, []);

  return { isMobile };
}

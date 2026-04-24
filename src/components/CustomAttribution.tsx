import React, { useState } from 'react';
import { MdInfoOutline } from 'react-icons/md';

export function CustomAttribution() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end pointer-events-none">
      {isOpen && (
        <div className="bg-bg-nav px-3 py-2 rounded-xl text-xs text-text-main pointer-events-auto mb-2 text-left">
          <div>MapLibre</div>
          <div className="w-full h-px bg-[#3c4043] my-1"></div>
          <div>© MapTiler</div>
          <div className="w-full h-px bg-[#3c4043] my-1"></div>
          <div>© OpenStreetMap <br/>contributors</div>
        </div>
      )}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-bg-nav p-1.5 rounded-full text-text-main flex items-center justify-center pointer-events-auto"
      >
        <MdInfoOutline size={20} />
      </button>
    </div>
  );
}

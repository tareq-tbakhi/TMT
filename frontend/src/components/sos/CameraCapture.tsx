/**
 * Camera capture component for attaching photos
 */

import { useRef } from "react";

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onCapture(dataUrl);
      onClose();
    };
    reader.readAsDataURL(file);
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Attach Photo
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Take a photo or select from your gallery to help describe your situation.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="space-y-3">
          {/* Camera button */}
          <button
            onClick={handleCameraClick}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path
                fillRule="evenodd"
                d="M1.5 7.125c0-1.036.84-1.875 1.875-1.875h3.5l1.5-2h7.25l1.5 2h3.5c1.035 0 1.875.84 1.875 1.875v10.5c0 1.036-.84 1.875-1.875 1.875H3.375a1.875 1.875 0 01-1.875-1.875v-10.5zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z"
                clipRule="evenodd"
              />
            </svg>
            Take Photo
          </button>

          {/* Cancel button */}
          <button
            onClick={onClose}
            className="w-full px-4 py-3 text-gray-600 font-medium hover:bg-gray-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

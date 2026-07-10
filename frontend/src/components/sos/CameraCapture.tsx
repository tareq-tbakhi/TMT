/**
 * Camera capture component for attaching photos
 */

import { useRef } from "react";
import { Camera } from "lucide-react";
import { Button } from "../ui";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-capture-title"
        className="w-full max-w-sm rounded-xl border border-edge bg-surface p-6 shadow-3"
      >
        <h3 id="camera-capture-title" className="mb-2 text-lg font-bold text-ink">
          Attach Photo
        </h3>
        <p className="mb-6 text-base text-ink-muted">
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

        <div className="flex flex-col gap-3">
          {/* Camera button */}
          <Button size="lg" fullWidth icon={<Camera />} onClick={handleCameraClick}>
            Take Photo
          </Button>

          {/* Cancel button */}
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

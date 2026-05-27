import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

const createFileFromDataUrl = (dataUrl, fileName = 'photo.jpg') => {
    const [meta, base64Data] = String(dataUrl || '').split(',');
    const mimeMatch = meta?.match(/data:(.*?);base64/);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';
    const binaryString = atob(base64Data || '');
    const length = binaryString.length;
    const bytes = new Uint8Array(length);

    for (let i = 0; i < length; i += 1) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return new File([bytes], fileName, { type: mimeType });
};

const pickFileFromInput = ({ capture = undefined } = {}) =>
    new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (capture) input.setAttribute('capture', capture);
        input.style.display = 'none';

        input.onchange = () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) {
                reject(new Error('Bạn chưa chọn ảnh.'));
                return;
            }
            resolve(file);
        };

        input.oncancel = () => {
            input.remove();
            reject(new Error('Đã hủy thao tác chọn ảnh.'));
        };

        document.body.appendChild(input);
        input.click();
    });

const photoToFile = async (photo) => {
    if (photo?.dataUrl) {
        return createFileFromDataUrl(photo.dataUrl, `capture-${Date.now()}.jpg`);
    }

    if (photo?.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        return new File([blob], `capture-${Date.now()}.jpg`, {
            type: blob.type || 'image/jpeg',
        });
    }

    throw new Error('Không đọc được dữ liệu ảnh từ camera.');
};

export const capturePhotoFile = async ({ quality = 85 } = {}) => {
    if (Capacitor.isNativePlatform()) {
        try {
            const photo = await Camera.getPhoto({
                quality,
                resultType: 'dataUrl',
                source: 'CAMERA',
                saveToGallery: false,
                correctOrientation: true,
            });

            const file = await photoToFile(photo);
            return {
                file,
                previewUrl: photo?.webPath || URL.createObjectURL(file),
                source: 'native',
            };
        } catch (error) {
            // Fall through to browser file picker.
        }
    }

    const file = await pickFileFromInput({ capture: 'environment' });
    return {
        file,
        previewUrl: URL.createObjectURL(file),
        source: 'web',
    };
};

export const pickPhotoFile = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            const photo = await Camera.getPhoto({
                quality: 85,
                resultType: 'dataUrl',
                source: 'PHOTOS',
                correctOrientation: true,
            });

            const file = await photoToFile(photo);
            return {
                file,
                previewUrl: photo?.webPath || URL.createObjectURL(file),
                source: 'native',
            };
        } catch (error) {
            if (error.message?.includes('User cancelled') || error.message?.includes('cancel')) {
                throw new Error('Đã hủy thao tác chọn ảnh.');
            }
            // Fall through to browser file picker if it was a different error (e.g. plugin loading/permission issue).
        }
    }

    const file = await pickFileFromInput();
    return {
        file,
        previewUrl: URL.createObjectURL(file),
        source: 'web',
    };
};

export const releasePreviewUrl = (previewUrl) => {
    if (typeof previewUrl === 'string' && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
    }
};

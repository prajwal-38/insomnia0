import { generateId } from "@designcombo/timeline";

const BASE_URL = "https://transcribe.designcombo.dev/presigned-url";

interface IUploadDetails {
  uploadUrl: string;
  url: string;
  name: string;
  id: string;
}

// Mock upload for development when the real endpoint is not available
const createMockUploadDetails = async (fileName: string): Promise<IUploadDetails> => {
  const currentFormat = fileName.split(".").pop();
  const uniqueFileName = `${generateId()}`;
  const updatedFileName = `${uniqueFileName}.${currentFormat}`;

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    uploadUrl: `mock://upload/${updatedFileName}`,
    url: `https://cdn.designcombo.dev/uploads/${updatedFileName}`,
    name: updatedFileName,
    id: uniqueFileName,
  };
};

export const createUploadsDetails = async (
  fileName: string,
): Promise<IUploadDetails> => {
  const currentFormat = fileName.split(".").pop();
  const uniqueFileName = `${generateId()}`;
  const updatedFileName = `${uniqueFileName}.${currentFormat}`;

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: updatedFileName }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      uploadUrl: data.presigned_url as string,
      url: data.url as string,
      name: updatedFileName,
      id: uniqueFileName,
    };
  } catch (error) {
    console.warn('Real upload endpoint not available, using mock upload:', error);
    // Fall back to mock upload for development
    return createMockUploadDetails(fileName);
  }
};

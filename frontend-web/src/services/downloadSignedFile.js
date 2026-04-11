export const downloadSignedFile = (downloadUrl, fallbackUrl) => {
  const url = downloadUrl || fallbackUrl;
  if (!url) {
    throw new Error("No download link available");
  }

  window.location.assign(url);
};

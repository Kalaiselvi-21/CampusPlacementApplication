import CryptoJS from 'crypto-js'; // use for hashing

// Generate passcode that changes every 5 minutes
export default function generatePasscode() {
  const currentTime = Date.now(); // current time in milliseconds
  const roundedTime = Math.floor(currentTime / (5 * 60 * 1000)); // round to nearest 5 minutes

  const secret = "gsaarc"; // keep it same on both sides
  const rawPasscode = `${secret}-${roundedTime}`;

  // Generate a short hash (you can take 6 digits or characters)
  const hash = CryptoJS.SHA256(rawPasscode).toString(CryptoJS.enc.Hex);
  const passcode = hash.substring(0, 6).toUpperCase(); // 6-char passcode

  return passcode;
}
console.log(generatePasscode());

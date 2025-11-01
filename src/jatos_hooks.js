/**
 * Detects if the study is running inside a JATOS environment.
 */
export const isJatosAvailable = () => typeof window !== 'undefined' && typeof window.jatos !== 'undefined';

export const submitToJatos = async (payload) => {
  if (!isJatosAvailable()) {
    return false;
  }
  try {
    await window.jatos.submitResultData(payload);
    return true;
  } catch (error) {
    console.error('JATOS submission failed:', error);
    return false;
  }
};

export const finishJatosStudy = async () => {
  if (!isJatosAvailable()) {
    return;
  }
  try {
    await window.jatos.endStudy();
  } catch (error) {
    console.error('Failed to end JATOS study:', error);
  }
};

/**
 * Extracts Prolific participant/session identifiers from the URL query string.
 */
export const parseProlificParams = (config) => {
  if (!config?.prolific?.enable) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  return {
    prolific_pid: params.get(config.prolific.participantParam || 'PROLIFIC_PID'),
    study_id: params.get(config.prolific.studyParam || 'STUDY_ID'),
    session_id: params.get(config.prolific.sessionParam || 'SESSION_ID')
  };
};

/**
 * Adds Prolific metadata to the jsPsych data store if available.
 */
export const tagProlificData = (jsPsych, prolificInfo) => {
  if (!prolificInfo) {
    return;
  }
  jsPsych.data.addProperties(prolificInfo);
};

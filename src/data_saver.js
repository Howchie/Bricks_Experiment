/**
 * Triggers a client-side download of the full jsPsych dataset in JSON and CSV
 * formats when local saving is enabled. This doubles as an audit log after offline runs.
 */
export const saveDataLocally = async (jsPsych, config) => {
  if (!config?.data?.localSave) {
    return;
  }
  const prefix = config.data.filePrefix || 'brick_task';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await jsPsych.data.get().localSave('json', `${prefix}_${timestamp}.json`);
  await jsPsych.data.get().localSave('csv', `${prefix}_${timestamp}.csv`);
};

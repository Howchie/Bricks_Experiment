import { initJsPsych } from 'jspsych';
import fullscreenPlugin from '@jspsych/plugin-fullscreen';
import htmlButtonResponse from '@jspsych/plugin-html-button-response';
import surveyLikert from '@jspsych/plugin-survey-likert';

import { ConveyorTrialPlugin } from './plugin-conveyor-trial.js';
import { loadRuntimeConfig, buildBlockPlan } from './config.js';
import { buildInstructionNode, buildBetweenBlockSummary } from './instructions.js';
import { parseProlificParams, tagProlificData } from './prolific.js';
import { saveDataLocally } from './data_saver.js';
import { submitToJatos, finishJatosStudy } from './jatos_hooks.js';

const scaleLookup = (scale, indexRaw) => {
  const indexNum = Number(indexRaw);
  if (!Number.isFinite(indexNum)) {
    return null;
  }
  if (indexNum >= 1 && indexNum <= scale.length) {
    return scale[indexNum - 1];
  }
  if (indexNum >= 0 && indexNum < scale.length) {
    return scale[indexNum];
  }
  return null;
};

(async () => {
  const config = loadRuntimeConfig();
  const prolificInfo = parseProlificParams(config);

  const jsPsych = initJsPsych({
    show_progress_bar: false,
    on_finish: async () => {
      const payload = jsPsych.data.get().json(true);
      await saveDataLocally(jsPsych, config);
      if (config.jatos?.enable) {
        await submitToJatos(payload);
        await finishJatosStudy();
      }
    }
  });

  tagProlificData(jsPsych, prolificInfo);

  const preloadAssets = config.experiment?.preloadAssets || [];
  if (preloadAssets.length) {
    // jsPsych changed audio preloading helpers across versions; fall back gracefully.
    const preloadAudio =
      jsPsych.pluginAPI.preloadAudioFiles || jsPsych.pluginAPI.preloadAudio || null;
    if (typeof preloadAudio === 'function') {
      await preloadAudio(preloadAssets);
    } else {
      await Promise.all(
        preloadAssets.map(
          (src) =>
            new Promise((resolve) => {
              const audio = new Audio(src);
              const finish = () => resolve();
              audio.addEventListener('canplaythrough', finish, { once: true });
              audio.addEventListener('error', finish, { once: true });
              audio.load();
            })
        )
      );
    }
  }

  const timeline = [];

  if (config.experiment?.fullScreen) {
    timeline.push({
      type: fullscreenPlugin,
      message: '<p>The experiment will now enter full screen mode.</p>',
      fullscreen_mode: true
    });
  }

  const instructions = buildInstructionNode(config);
  if (instructions) {
    timeline.push(instructions);
  }

  const blockPlan = buildBlockPlan(config);
  const likertScale = config.selfReport?.likertScale || [];

  if (instructions && blockPlan.length > 0 && blockPlan[0].isPractice) {
    const practiceBlock = blockPlan[0];
    instructions.pages.push(
      `<h2>${practiceBlock.label}</h2><p>This is a practice block. Click the "Next" button when you are ready to begin.</p>`
    );
  }

  blockPlan.forEach((block, blockIdx) => {
    if (blockIdx > 0 || !block.isPractice) {
      timeline.push({
        type: htmlButtonResponse,
        stimulus: `<h2>${block.label}</h2><p>${
          block.isPractice
            ? 'This is a practice block. Click continue when you are ready.'
            : 'Click continue to begin the next block.'
        }</p>`,
        choices: ['Continue']
      });
    }

    for (let t = 0; t < block.trials; t += 1) {
      timeline.push({
        type: ConveyorTrialPlugin,
        blockLabel: block.label,
        blockIndex: block.index,
        trialIndex: t,
        config: block.config
      });

      if (config.selfReport?.enable) {
        timeline.push({
          type: surveyLikert,
          preamble: `<p>${config.selfReport.prompt}</p>`,
          questions: [
            {
              prompt: 'Workload',
              labels: likertScale.map((item) => item.label),
              required: true,
              name: 'workload'
            }
          ],
          on_finish: (data) => {
            let responses = {};
            try {
              responses = JSON.parse(data.responses);
            } catch (error) {
              responses = data.response || {};
            }
            const selection = responses.workload;
            const chosen = scaleLookup(likertScale, selection);
            data.block_label = block.label;
            data.block_index = block.index;
            data.trial_index = t;
            data.workload_value = chosen?.value ?? null;
            data.workload_label = chosen?.label ?? null;
          }
        });
      }
    }

    if (config.experiment?.showBetweenBlockSummary) {
      const summaryNode = buildBetweenBlockSummary('<p>Computing summary…</p>');
      summaryNode.on_start = (trial) => {
        const blockTrials = jsPsych.data.get().filter({
          block_label: block.label,
          trial_type: 'conveyor-trial'
        });
        const stats = blockTrials.values().reduce(
          (acc, row) => {
            const gameStats = row.game?.stats || {};
            const drtStats = row.drt?.stats || {};
            acc.cleared += gameStats.cleared ?? 0;
            acc.dropped += gameStats.dropped ?? 0;
            acc.spawned += gameStats.spawned ?? 0;
            acc.hits += drtStats.hits ?? 0;
            acc.misses += drtStats.misses ?? 0;
            return acc;
          },
          { cleared: 0, dropped: 0, spawned: 0, hits: 0, misses: 0 }
        );
        trial.stimulus = `
          <h2>${block.label} summary</h2>
          <ul>
            <li>Bricks cleared: ${stats.cleared}</li>
            <li>Bricks dropped: ${stats.dropped}</li>
            <li>DRT hits: ${stats.hits}</li>
            <li>DRT misses: ${stats.misses}</li>
          </ul>
        `;
      };
      timeline.push(summaryNode);
    }
  });

  timeline.push({
    type: fullscreenPlugin,
    message: '<p>The experiment is complete. Click continue to exit full screen.</p>',
    fullscreen_mode: false
  });

  timeline.push({
    type: htmlButtonResponse,
    stimulus: '<h2>Thank you for participating!</h2><p>You may close this window.</p>',
    choices: ['Finish']
  });

  await jsPsych.run(timeline);
})();

import instructionsPlugin from '@jspsych/plugin-instructions';
import htmlButtonResponse from '@jspsych/plugin-html-button-response';

/**
 * Creates the instruction node for the timeline using config-provided pages.
 */
export const buildInstructionNode = (config) => {
  const pages = (config.instructions?.pages || []).map((page) => {
    const title = page.title ? `<h2>${page.title}</h2>` : '';
    const body = page.html ?? '';
    return `<div class="instruction-content">${title}${body}</div>`;
  });
  if (!pages.length) {
    return null;
  }
  return {
    type: instructionsPlugin,
    pages,
    show_clickable_nav: true,
    allow_backward: Boolean(config.experiment?.allowBackOnInstructions),
    button_label_next: 'Next',
    button_label_previous: 'Back'
  };
};

/**
 * Utility for generating between-block summaries using html-button-response.
 */
export const buildBetweenBlockSummary = (summaryHtml) => ({
  type: htmlButtonResponse,
  stimulus: summaryHtml,
  choices: ['Continue']
});

export const IS_TOOL_MOCK_MODE = String(process.env.CB_TOOL_MOCK_MODE || '').trim() === '1';

export default { IS_TOOL_MOCK_MODE };

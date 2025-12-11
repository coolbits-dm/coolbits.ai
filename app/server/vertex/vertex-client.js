export async function callVertexModel(payload, config = {}) {
  const { projectId, location, model } = config;
  console.info('Vertex client placeholder invoked', { projectId, location, model });
  throw new Error('Vertex client not implemented. Falling back to mock plan.');
}

const defaultOptions = {
  origin: ['https://coolbits.ai', 'https://www.coolbits.ai', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-Visitor-Id'],
};

function buildOriginSet(option) {
  const list = Array.isArray(option) ? option : [option];
  return new Set(list.filter(Boolean));
}

export default function cors(options = {}) {
  const config = { ...defaultOptions, ...options };
  const allowedOrigins = buildOriginSet(config.origin);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.size === 0) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (allowedOrigins.size > 0) {
      const fallback = Array.from(allowedOrigins)[0];
      if (fallback) {
        res.setHeader('Access-Control-Allow-Origin', fallback);
      }
    }
    res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

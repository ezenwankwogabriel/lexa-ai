import 'dotenv/config';
import Fastify from 'fastify';
import { healthRoutes } from './routes/health';
import { identifyRoutes } from './routes/identify';
import { searchRoutes } from './routes/search';
import { reviewRoutes } from './routes/review';

const app = Fastify({ logger: true });

app.register(healthRoutes);
app.register(identifyRoutes);
app.register(searchRoutes);
app.register(reviewRoutes);

const port = parseInt(process.env.PORT ?? '3000', 10);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

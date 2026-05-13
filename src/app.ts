import 'dotenv/config';
import Fastify from 'fastify';
import { healthRoutes } from './routes/health';
import { identifyRoutes } from './routes/identify';
import { searchRoutes } from './routes/search';
import { reviewRoutes } from './routes/review';
import { deviceRoutes } from './routes/device';
import { vocabularyRoutes } from './routes/vocabulary';
import { onboardingRoutes } from './routes/onboarding';
import { expandRoutes } from './routes/expand';
import { quizRoutes } from './routes/quiz';
import { startReviewReminderJob } from './jobs/reviewReminder';
import { startVocabReplenishmentJob } from './jobs/vocabReplenishment';
import { runDistractorBackfill } from './jobs/distractorBackfill';

const app = Fastify({ logger: true });

app.register(healthRoutes);
app.register(identifyRoutes);
app.register(searchRoutes);
app.register(reviewRoutes);
app.register(deviceRoutes);
app.register(vocabularyRoutes);
app.register(onboardingRoutes);
app.register(expandRoutes);
app.register(quizRoutes);

startReviewReminderJob();
startVocabReplenishmentJob();
void runDistractorBackfill();

const port = parseInt(process.env.PORT ?? '3000', 10);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

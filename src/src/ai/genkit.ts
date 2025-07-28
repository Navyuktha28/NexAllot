import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI({apiKey: 'AIzaSyCWY89uq8p6E8F-LGPBtAzg0EKT9Xpn5M4'})],
  model: 'googleai/gemini-2.0-flash',
});

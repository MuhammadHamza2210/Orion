import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        sector: {
          tech: '#7F77DD',
          finance: '#1D9E75',
          healthcare: '#D85A30',
          energy: '#EF9F27',
          consumer: '#378ADD',
        },
        gain: '#1D9E75',
        loss: '#E24B4A',
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;

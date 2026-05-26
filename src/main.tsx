import { createRoot } from 'react-dom/client';
import AdvancedAnalyticsApp from './AdvancedAnalyticsApp';
import './styles.css';
import './unified.css';
import './visual-analytics.css';
import './analytics-experience.css';

createRoot(document.getElementById('root')!).render(<AdvancedAnalyticsApp />);

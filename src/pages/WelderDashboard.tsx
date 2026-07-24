import TradeDashboard from './trades/TradeDashboard';

/**
 * Welders and electricians share one implementation — see TradeDashboard.
 * Kept as a named page so the role router in Index.tsx stays readable.
 */
const WelderDashboard = () => <TradeDashboard trade="welder" />;

export default WelderDashboard;

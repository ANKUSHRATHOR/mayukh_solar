import TradeDashboard from './trades/TradeDashboard';

/**
 * Welders and electricians share one implementation — see TradeDashboard.
 * The electrician variant additionally captures panel and inverter serials.
 */
const ElectricianDashboard = () => <TradeDashboard trade="electrician" />;

export default ElectricianDashboard;

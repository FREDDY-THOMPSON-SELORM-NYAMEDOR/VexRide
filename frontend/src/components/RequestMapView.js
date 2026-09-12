import { Platform } from 'react-native';

const RequestMapView = Platform.OS === 'web'
	? require('./RequestMapView.web').default
	: require('./RequestMapView.native').default;

export default RequestMapView;

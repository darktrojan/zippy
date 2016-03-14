Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

function ZippyAboutHandler() {
}

ZippyAboutHandler.prototype = {
	newChannel: function(aURI) {
		let channel = Services.io.newChannel('chrome://zippy/content/zippy.xhtml', null, null);
		channel.originalURI = aURI;
		return channel;
	},
	getURIFlags: function(aURI) {
		return Components.interfaces.nsIAboutModule.ALLOW_SCRIPT;
	},
	classDescription: 'About Zippy Page',
	classID: Components.ID('a6fb9735-572e-4aaa-a02e-a850bbf127aa'),
	contractID: '@mozilla.org/network/protocol/about;1?what=zippy',
	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIAboutModule])
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([ZippyAboutHandler]);

Components.utils.import("resource://gre/modules/Services.jsm");

const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

var ZippyController = {
	observe: function(aSubject, aTopic, aData) {
		let window = aSubject;
		let document = window.document;
		if (document.documentURIObject.spec != "about:addons") {
			return;
		}
		window.addEventListener("load", function() {
			ZippyController.load(document);
		}, false);
	},
	load: function(document) {
		try {
			let popup = document.getElementById("addonitem-popup");
			popup.addEventListener("popupshowing", ZippyController.popupShowing, false);
			let separator = document.createElementNS(XULNS, "menuseparator");
			separator.setAttribute("id", "zippy-separator");
			popup.appendChild(separator);
			let menuitem = document.createElementNS(XULNS, "menuitem");
			menuitem.setAttribute("id", "zippy-menuitem");
			menuitem.setAttribute("label", "Create XPI");
			menuitem.addEventListener("command", function() {
				let tabURI = "chrome://zippy/content/zippy.xhtml?id=" + this.getAttribute("addon-id");
				let recentWindow = Services.wm.getMostRecentWindow("navigator:browser");
				if (recentWindow) {
					let browser = recentWindow.gBrowser;
					browser.selectedTab = browser.addTab(tabURI);
				} else {
					recentWindow = Services.wm.getMostRecentWindow("mail:3pane");
					let recentDocument = recentWindow.document;
					let tabMail = recentDocument.getElementById("tabmail");
					tabMail.openTab("contentTab", {contentPage: tabURI});
  				}
				recentWindow.focus();
				return;
			}, false);
			popup.appendChild(menuitem);
		} catch(e) {
			Components.utils.reportError(e);
		}
	},
	unload: function(document) {
		try {
			let popup = document.getElementById("addonitem-popup");
			let separator = document.getElementById("zippy-separator");
			let menuitem = document.getElementById("zippy-menuitem");
			popup.removeEventListener("popupshowing", this.popupShowing, false);
			popup.removeChild(separator);
			popup.removeChild(menuitem);
		} catch(e) {
			Components.utils.reportError(e);
		}
	},
	popupShowing: function(event) {
		let show = false;

		let document = event.target.ownerDocument;
		let window = document.defaultView;
		let separator = document.getElementById("zippy-separator");
		let menuitem = document.getElementById("zippy-menuitem");
		let view = window.gViewController.currentViewObj;

		if (view == window.gDetailView) {
			show = view._addon.type == "extension";
			menuitem.setAttribute("addon-id", view._addon.id);
		} else if (view == window.gListView) {
			show = view._type == "extension";
			menuitem.setAttribute("addon-id", view.getSelectedAddon().id);
		}
		separator.collapsed = !show;
		menuitem.collapsed = !show;
	}
}

function install(params, aReason) {
}
function uninstall(params, aReason) {
}
function startup(params, aReason) {
	if (parseFloat(Services.appinfo.platformVersion) < 10.0) {
		params.installPath.QueryInterface(Components.interfaces.nsILocalFile);
		Components.manager.addBootstrappedManifestLocation(params.installPath);
	}

	Services.obs.addObserver(ZippyController, "chrome-document-global-created", false);
	enumerateAddonsPages(ZippyController.load);
}
function shutdown(params, aReason) {
	Services.obs.removeObserver(ZippyController, "chrome-document-global-created");
	enumerateAddonsPages(ZippyController.unload);

	if (parseFloat(Services.appinfo.platformVersion) < 10.0) {
		params.installPath.QueryInterface(Components.interfaces.nsILocalFile);
		Components.manager.removeBootstrappedManifestLocation(params.installPath);
	}
}

function enumerateAddonsPages(callback) {
	let windowEnum = Services.wm.getEnumerator("navigator:browser");
	while (windowEnum.hasMoreElements()) {
		let window = windowEnum.getNext();
		let tabs = window.gBrowser.tabs;
		for (let i = 0; i < tabs.length; i++) {
			let browser = tabs[i].linkedBrowser;
			if (browser.currentURI.spec == "about:addons") {
				callback(browser.contentDocument);
			}
		}
	}
}

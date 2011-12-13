const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const XHTMLNS = "http://www.w3.org/1999/xhtml";

Cu.import ('resource://gre/modules/Services.jsm');
Cu.import ('resource://gre/modules/AddonManager.jsm');
Cu.import ('resource://gre/modules/FileUtils.jsm');

var id = location.search.replace ('?id=', '');
var dirPathLength, listOfFiles;
var locales = {};
var localeObj = {};
var directory, version;
var doJarFile = false;
var amoPropertiesFiles = false;

var versionInput = document.getElementById ('version');
var doJarFileInput = document.getElementById ('dojarfile');
var amoPropertiesInput = document.getElementById ('amoproperties');
var logLog = document.getElementById ('log-log');
var jarLog = document.getElementById ('jar-added');
var packageLog = document.getElementById ('main-added');

AddonManager.getAddonByID (id, function (addon) {
	document.getElementById ('title').textContent = document.title = 'Create XPI Package for ' + addon.name;
	version = versionInput.value = addon.version;
});

directory = findInstall ();
if (directory && directory.isDirectory ()) {
	dirPathLength = directory.path.length + 1;
	document.getElementById ('location').textContent = directory.path;
} else {
	log (id + " couldn't be found, or it's already a .xpi file.");
}

function createXPI () {
	let rdfFile = directory.clone ();
	rdfFile.append ('install.rdf');
	if (versionInput.value != version) {
		version = versionInput.value;
		let data = readFile (rdfFile);
		data = data.replace (/<em:version>.*<\/em:version>/gi, '<em:version>' + version + '</em:version>');
		writeFile (rdfFile, data);
	}
	doJarFile = doJarFileInput.checked;
	amoPropertiesFiles = amoPropertiesInput.checked;

	while (logLog.lastChild) {
		logLog.removeChild (logLog.lastChild);
	}
	while (jarLog.lastChild) {
		jarLog.removeChild (jarLog.lastChild);
	}
	jarLog.previousElementSibling.style.display = doJarFile ? 'block' : 'none';
	jarLog.style.display = doJarFile ? 'block' : 'none';
	while (packageLog.lastChild) {
		packageLog.removeChild (packageLog.lastChild);
	}
	packageLog.previousElementSibling.style.display = 'block';
	packageLog.style.display = 'block';

	zipExtension (directory);
}

// adapted from XPIProvider.jsm
function findInstall () {
	let hasRegistry = ("nsIWindowsRegKey" in Ci);
	let enabledScopes = AddonManager.SCOPE_ALL
	try {
		Services.prefs.getIntPref ("extensions.enabledScopes");
	} catch (e) {
	}
	let directory;

	// The profile location is always enabled
	directory = findInDirectory ("ProfD", ["extensions"]);
	if (directory) {
		return directory;
	}

	if (enabledScopes & AddonManager.SCOPE_USER) {
		directory = findInDirectory ("XREUSysExt", [Services.appinfo.ID]);
		if (directory) {
			return directory;
		}
		if (hasRegistry) {
			directory = findInRegistry (Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER);
			if (directory) {
				return directory;
			}
		}
	}

	if (enabledScopes & AddonManager.SCOPE_APPLICATION) {
		directory = findInDirectory ("XCurProcD", ["extensions"]);
		if (directory) {
			return directory;
		}
	}

	if (enabledScopes & AddonManager.SCOPE_SYSTEM) {
		directory = findInDirectory ("XRESysLExtPD", [Services.appinfo.ID]);
		if (directory) {
			return directory;
		}
		if (hasRegistry) {
			directory = findInRegistry (Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE);
			if (directory) {
				return directory;
			}
		}
	}

	function findInRegistry (rootKey) {
		let appVendor = Services.appinfo.vendor;
		let appName = Services.appinfo.name;

		// XULRunner-based apps may intentionally not specify a vendor
		if (appVendor != "")
			appVendor += "\\";

		// Thunderbird is stupid
		if (appName == 'Thunderbird')
			appVendor = 'Mozilla\\';

		let key;
		try {
			key = Cc["@mozilla.org/windows-registry-key;1"].createInstance (Ci.nsIWindowsRegKey);
			key.open (rootKey,
				'SOFTWARE\\' + appVendor + appName + '\\Extensions',
				Ci.nsIWindowsRegKey.ACCESS_READ);
			if (key.hasValue (id)) {
				var file = Cc["@mozilla.org/file/local;1"].createInstance (Ci.nsILocalFile);
				file.initWithPath (key.readStringValue (id));
				return file;
			}
		} catch (e) {
			Cu.reportError (e);
		} finally {
			key.close ();
		}
		return null;
	}

	function findInDirectory (aKey, aPaths) {
		try {
			let dir = FileUtils.getDir (aKey, aPaths);
			dir.append (id);
			if (dir.exists ()) {
				return dir;
			}
        } catch (e) {
        }
	}
}

function log (str, className) {
	var li = document.createElementNS (XHTMLNS, 'li');
	li.appendChild (document.createTextNode (str));
	switch (className) {
	case 'jar-added':
		if (/^locale\/.{2,5}\/.+\.(dtd|properties)$/.test (str)) {
			li.id = str.substring (7);
		}
		jarLog.appendChild (li);
		return;
	case 'jar-notadded':
		li.style.color = '#ccc';
		jarLog.appendChild (li);
		return;
	case 'main-added':
		if (/^chrome\/locale\/.{2,5}\/.+\.(dtd|properties)$/.test (str)) {
			li.id = str.substring (14);
		}
		packageLog.appendChild (li);
		return;
	case 'main-notadded':
		li.style.color = '#ccc';
		packageLog.appendChild (li);
		return;
	case 'main-error':
		li.style.color = '#c00';
		packageLog.appendChild (li);
		return;
	default:
		logLog.appendChild (li);
		return;
	}
}

function readFile (file) {
	var str = {};

	var fiStream = Cc ["@mozilla.org/network/file-input-stream;1"].createInstance (Ci.nsIFileInputStream);
	fiStream.init (file, -1, 0, 0);

	var istream = Cc ["@mozilla.org/intl/converter-input-stream;1"].createInstance (Ci.nsIConverterInputStream);
	istream.init (fiStream, "UTF-8", 0, 0);
	istream.readString (-1, str);
	istream.close ();

	return str.value;
}

function readFileLines (file) {
	var lines = [];
	try {
		if (!file.exists ()) {
			return lines;
		}

		var fiStream = Cc ["@mozilla.org/network/file-input-stream;1"].createInstance (Ci.nsIFileInputStream);
		fiStream.init (file, 0x01, 0444, 0);

		var istream = Cc ["@mozilla.org/intl/converter-input-stream;1"].createInstance (Ci.nsIConverterInputStream);
		istream.init (fiStream, "UTF-8", 0, 0);
		istream.QueryInterface (Ci.nsIUnicharLineInputStream);

		var line = {}, hasmore;
		do {
			hasmore = istream.readLine (line);
			lines.push (line.value);
		} while (hasmore);

		istream.close ();
	} catch (e) {
		Cu.reportError (e);
	}
	return lines;
}

function writeFile (file, data) {
	var foStream = Cc ["@mozilla.org/network/file-output-stream;1"].createInstance (Ci.nsIFileOutputStream);
	foStream.init (file, 0x02 | 0x08 | 0x20, 0666, 0);

	var converter = Cc ["@mozilla.org/intl/converter-output-stream;1"].createInstance (Ci.nsIConverterOutputStream);
	converter.init (foStream, "UTF-8", 0, 0);
	converter.writeString (data);
	converter.close ();
}

function zipExtension () {
	var listFile = directory.clone ();
	listFile.append ("xpi.list");

	if (listFile.exists ()) {
		listOfFiles = [];
		let tempListOfFiles = readFileLines (listFile);
		for (let i = 0, iCount = tempListOfFiles.length; i < iCount; i++) {
			let line = tempListOfFiles [i].replace (/\\/g, '/');
			if (line [0] == '#')
				continue;
			listOfFiles.push (line);
		}
	}

	try {
		var chromeDir = directory.clone ();
		chromeDir.append ('chrome');

		if (doJarFile && chromeDir.exists ()) {
			log ('Creating chrome.jar', 'meta');
			var jarFile = chromeDir.clone ();
			jarFile.append ('chrome.jar');
			var jarWriter = Cc ["@mozilla.org/zipwriter;1"].createInstance (Ci.nsIZipWriter);
			jarWriter.open (jarFile, 0x02 | 0x08 | 0x20);
			jarAddDirectory (chromeDir, false, jarWriter);
			jarWriter.close ();
			log ('Finished creating chrome.jar', 'meta');
		}

		log ('Creating main package', 'meta');
		var xpiFile = directory.clone ();
		xpiFile.append (directory.leafName + "-" + version + ".xpi");
		var xpiWriter = Cc ["@mozilla.org/zipwriter;1"].createInstance (Ci.nsIZipWriter);
		xpiWriter.open (xpiFile, 0x02 | 0x08 | 0x20);
		xpiAddDirectory (directory, false, xpiWriter);
		log ('Finished creating main package', 'meta');

		if (doJarFile && chromeDir.exists ()) {
			log ('Removing temporary chrome.jar', 'meta');
			jarFile.remove (true);
		}

		if (listOfFiles) {
			for (var i = 0; i < listOfFiles.length; i++) {
				if (listOfFiles [i] != '') {
					log ('Not found: ' + listOfFiles [i], 'main-error');
				}
			}
		}

		checkLocales ();
	} catch (e) {
		Cu.reportError (e);
	} finally {
		xpiWriter.close ();
	}

	return true;
}

function jarAddDirectory (directory, wildcard, zipWriter) {
	var files = [];
	var entries = directory.directoryEntries;
	while (entries.hasMoreElements ()) {
		files.push(entries.getNext().QueryInterface(Ci.nsIFile));
	}
	files.sort(sortFiles);
	for (var i = 0; i < files.length; i++) {
		var file = files[i];
		var relativePath = file.path.substring (dirPathLength + 7).replace (/\\/g, '/');

		if (file.isDirectory ()) {
			if (listOfFiles) {
				var index = listOfFiles.indexOf ('chrome/' + relativePath);
				var wildcardIndex = listOfFiles.indexOf ('chrome/' + relativePath + '/*');
				if (!wildcard && index < 0 && wildcardIndex < 0) {
					log ('Not added: ' + relativePath, 'jar-notadded');
					continue;
				}
				if (index >= 0) {
					listOfFiles.splice (index, 1);
					wildcardIndex = listOfFiles.indexOf ('chrome/' + relativePath + '/*');
				}
				if (wildcardIndex >= 0) {
					log (relativePath + ' (wildcard)', 'jar-added');
					listOfFiles.splice (wildcardIndex, 1);
				} else {
					log (relativePath, 'jar-added');
				}
				zipWriter.addEntryDirectory (relativePath, file.lastModifiedTime * 1000, false);
				jarAddDirectory (file, wildcard || wildcardIndex >= 0, zipWriter);
			} else {
				if (!zipWriter.hasEntry (relativePath)) {
					log (relativePath, 'jar-added');
					zipWriter.addEntryDirectory (relativePath, file.lastModifiedTime * 1000, false);
				}
				jarAddDirectory (file, wildcard, zipWriter);
			}
			continue;
		}

		if (/\.(jar|xpi|zip)$/i.test (relativePath)) {
			continue;
		}

		if (!amoPropertiesFiles && /amo\.properties$/i.test (relativePath)) {
			log ('Not added: ' + relativePath, 'jar-notadded');
			continue;
		}

		if (/\.(properties|dtd)$/.test (relativePath)) {
			if (typeof locales [directory.leafName] == 'undefined') {
				locales [directory.leafName] = [];
			}
			locales [directory.leafName].push (file);
		}

		if (!wildcard && listOfFiles) {
			var index = listOfFiles.indexOf ('chrome/' + relativePath);
			if (index < 0) {
				log ('Not added: ' + relativePath, 'jar-notadded');
				continue;
			}
			listOfFiles.splice (index, 1);
		}

		log (relativePath, 'jar-added');
		zipWriter.addEntryFile (relativePath, Ci.nsIZipWriter.COMPRESSION_DEFAULT, file, false);
	}
}

function xpiAddDirectory (directory, wildcard, zipWriter) {
	var dirRelativePath = directory.path.substring (dirPathLength).replace (/\\/g, '/');
	if (doJarFile && dirRelativePath == 'chrome') {
		log ('chrome/chrome.jar', 'main-added');
		let jarFile = directory.clone ();
		jarFile.append ('chrome.jar');
		zipWriter.addEntryFile ('chrome/chrome.jar', Ci.nsIZipWriter.COMPRESSION_DEFAULT, jarFile, false);
		return;
	}

	var files = [];
	var entries = directory.directoryEntries;
	while (entries.hasMoreElements ()) {
		files.push(entries.getNext().QueryInterface(Ci.nsIFile));
	}
	files.sort(sortFiles);
	for (var i = 0; i < files.length; i++) {
		var file = files[i];
		var relativePath = file.path.substring (dirPathLength).replace (/\\/g, '/');

		if (file.isDirectory ()) {
			if (listOfFiles) {
				var index = listOfFiles.indexOf (relativePath);
				var wildcardIndex = listOfFiles.indexOf (relativePath + '/*');
				if (!wildcard && index < 0 && wildcardIndex < 0) {
					log ('Not added: ' + relativePath, 'main-notadded');
					continue;
				}
				if (index >= 0) {
					listOfFiles.splice (index, 1);
					wildcardIndex = listOfFiles.indexOf (relativePath + '/*');
				}
				if (wildcardIndex >= 0) {
					log (relativePath + ' (wildcard)', 'main-added');
					listOfFiles.splice (wildcardIndex, 1);
				} else {
					log (relativePath, 'main-added');
				}
				zipWriter.addEntryDirectory (relativePath, file.lastModifiedTime * 1000, false);
				xpiAddDirectory (file, wildcard || wildcardIndex >= 0, zipWriter);
			} else {
				if (!zipWriter.hasEntry (relativePath)) {
					log (relativePath, 'main-added');
					zipWriter.addEntryDirectory (relativePath, file.lastModifiedTime * 1000, false);
				}
				xpiAddDirectory (file, wildcard, zipWriter);
			}
			continue;
		}

		if (doJarFile && relativePath == 'chrome.manifest') {
			let lines = readFileLines (file);
			let newLines = [];
			for (let i = 0, iCount = lines.length; i < iCount; i++) {
				newLines.push (lines [i].replace (/(\s)chrome\//, '$1jar:chrome/chrome.jar!/'));
			}
			let tmpFile = directory.clone ();
			tmpFile.append ('chrome.manifest.tmp');
			writeFile (tmpFile, newLines.join ('\n') + '\n');
			log (relativePath, 'main-added');
			zipWriter.addEntryFile (relativePath, Ci.nsIZipWriter.COMPRESSION_DEFAULT, tmpFile, false);
			tmpFile.remove (true);

			if (listOfFiles) {
				var index = listOfFiles.indexOf (relativePath);
				listOfFiles.splice (index, 1);
			}
			continue;
		}

		if (/\.(xpi|zip)$/i.test (relativePath)) {
			log ('Not added: ' + relativePath, 'main-notadded');
			continue;
		}

		if (!amoPropertiesFiles && /amo\.properties$/i.test (relativePath)) {
			log ('Not added: ' + relativePath, 'main-notadded');
			continue;
		}

		if (!wildcard && listOfFiles) {
			var index = listOfFiles.indexOf (relativePath);
			if (index < 0) {
				if (relativePath != 'xpi.list') {
					log ('Not added: ' + relativePath, 'main-notadded');
				}
				continue;
			}
			listOfFiles.splice (index, 1);
		}

		if (/\.(properties|dtd)$/.test (relativePath)) {
			if (typeof locales [directory.leafName] == 'undefined') {
				locales [directory.leafName] = [];
			}
			locales [directory.leafName].push (file);
		}

		log (relativePath, 'main-added');
		zipWriter.addEntryFile (relativePath, Ci.nsIZipWriter.COMPRESSION_DEFAULT, file, false);
	}
}

function sortFiles(aFile, bFile) {
	let aName = aFile.leafName.toLowerCase();
	let bName = bFile.leafName.toLowerCase();
	if (aName == bName)
		return 0;
	return aName < bName ? -1 : 1;
}

function checkLocales () {

	if (!locales ['en-US']) {
		return;
	}

	for (var l in locales) {
		var files = {};
		for (var i = 0; i < locales [l].length; i++) {
			var file = locales [l][i];
			var strings = {};
			if (/\.properties/.test (file.leafName)) {
				doPropertiesFile (file, strings);
			} else {
				doDtdFile (file, strings);
			}
			files [file.leafName] = strings;
		}
		localeObj [l] = files;
	}

	for (var l in localeObj) {
		if (l == 'en-US')
			continue;

		for (var f in localeObj ['en-US']) {
			if (!localeObj [l][f]) {
				log (f + ' in ' + l + ' is missing', 'main-error');
				continue;
			}
			var yes = 0, equal = 0, no = 0;
			for (var s in localeObj ['en-US'][f]) {
				var enString = localeObj ['en-US'][f][s];
				var lString = localeObj [l][f][s];
				if (typeof lString == 'undefined') {
					no++;
				} else if (lString == enString) {
					equal++;
				} else {
					yes++;
				}
			}
			var d = document.getElementById (l + '/' + f);
			if (d) {
				var s = document.createElement ('span');
				if (no > 0) {
					s.className = 'no';
					s.appendChild (document.createTextNode (no));
				} else if (equal > 0) {
					s.className = 'equal';
					s.appendChild (document.createTextNode (equal));
				} else {
					s.className = 'yes';
					s.appendChild (document.createTextNode (yes));
				}
				d.appendChild (s);
			}
		}
	}
}

function doPropertiesFile (file, strings) {
	var leafName = file.leafName;
	var lines = readFileLines (file);
	for (let i = 0, iCount = lines.length; i < iCount; i++) {
		var realLine = lines [i].replace (/#.*$/, '');
		var m = realLine.match (/^([\w\.-]+)\s*=\s*(.*)$/);
		if (m) {
			strings [m [1]] = m [2];
		}
	}
}

function doDtdFile (file, strings) {
	var leafName = file.leafName;
	var lines = readFileLines (file);
	for (let i = 0, iCount = lines.length; i < iCount; i++) {
		var realLine = lines [i].replace (/<!--.*$/, '');
		var m = realLine.match (/ENTITY\s+([\w\.-]+)\s+"(.*)"/);
		if (m) {
			strings [m [1]] = m [2];
		}
	}
}

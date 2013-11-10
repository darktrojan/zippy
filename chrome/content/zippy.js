const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const XHTMLNS = 'http://www.w3.org/1999/xhtml';

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/AddonManager.jsm');
Cu.import('resource://gre/modules/FileUtils.jsm');

let id = location.search.replace('?id=', '');
let dirPathLength;
let listOfFiles, hasListOfFiles;
let listOfExcludedFiles;
let locales = {};
let localeObj = {};
let directory, version;
let amoPropertiesFiles = false;

let versionInput = document.getElementById('version');
let amoPropertiesInput = document.getElementById('amoproperties');
let packageLog = document.getElementById('main-added');

AddonManager.getAddonByID(id, function(addon) {
	document.getElementById('title').textContent = document.title = 'Create XPI Package for ' + addon.name;
	version = versionInput.value = addon.version;
	directory = addon.getResourceURI('').QueryInterface(Ci.nsIFileURL).file;

	if (directory && directory.isDirectory()) {
		dirPathLength = directory.path.length + 1;
		document.getElementById('location').textContent = directory.path;
	} else {
		log(id + " couldn't be found, or it's already a .xpi file.", 'main-error');
	}
});

function createXPI() {
	let rdfFile = directory.clone();
	rdfFile.append('install.rdf');
	if (versionInput.value != version) {
		version = versionInput.value;
		let data = readFile(rdfFile);
		data = data.replace(/<em:version>.*<\/em:version>/gi, '<em:version>' + version + '</em:version>');
		writeFile(rdfFile, data);
	}
	amoPropertiesFiles = amoPropertiesInput.checked;

	while (packageLog.lastChild) {
		packageLog.removeChild(packageLog.lastChild);
	}

	zipExtension(directory);
}

function log(str, className) {
	let li = document.createElementNS(XHTMLNS, 'li');
	li.appendChild(document.createTextNode(str));
	switch (className) {
	case 'main-added':
		let match = /\/.+\.(dtd|properties)$/.exec(str);
		if (match) {
			li.id = match[0].substring(1);
		}
		packageLog.appendChild(li);
		return;
	case 'main-notadded':
		li.style.color = '#ccc';
		packageLog.appendChild(li);
		return;
	case 'main-error':
		li.style.color = '#c00';
		packageLog.appendChild(li);
		return;
	}
}

function readFile(file) {
	let str = {};

	let fiStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
	fiStream.init(file, -1, 0, 0);

	let istream = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
	istream.init(fiStream, 'UTF-8', 0, 0);
	istream.readString(-1, str);
	istream.close();

	return str.value;
}

function readFileLines(file) {
	let lines = [];
	try {
		if (!file.exists()) {
			return lines;
		}

		let fiStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
		fiStream.init(file, 0x01, 0444, 0);

		let istream = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
		istream.init(fiStream, 'UTF-8', 0, 0);
		istream.QueryInterface(Ci.nsIUnicharLineInputStream);

		let line = {}, hasmore;
		do {
			hasmore = istream.readLine(line);
			lines.push(line.value);
		} while (hasmore);

		istream.close();
	} catch (e) {
		Cu.reportError(e);
	}
	return lines;
}

function writeFile(file, data) {
	let foStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
	foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);

	let converter = Cc['@mozilla.org/intl/converter-output-stream;1'].createInstance(Ci.nsIConverterOutputStream);
	converter.init(foStream, 'UTF-8', 0, 0);
	converter.writeString(data);
	converter.close();
}

function readList(filename) {
	let listFile = directory.clone();
	listFile.append(filename);

	let list = [];
	if (listFile.exists()) {
		let lines = readFileLines(listFile);
		for (let i = 0, iCount = lines.length; i < iCount; i++) {
			let line = lines[i].replace(/\\/g, '/').trim();
			if (line.length == 0 || line[0] == '#')
				continue;
			list.push(line);
		}
	}
	return list;
}

function zipExtension() {
	listOfFiles = readList('xpi.list');
	hasListOfFiles = listOfFiles.length > 0;
	listOfExcludedFiles = readList('xpi-exclude.list');
	listOfExcludedFiles.push('*.list');
	listOfExcludedFiles.push('*.xpi');
	listOfExcludedFiles.push('*.zip');
	listOfExcludedFiles.push('.git');
	listOfExcludedFiles.push('.gitignore');
	listOfExcludedFiles.push('.hg');
	listOfExcludedFiles.push('.hgignore');
	listOfExcludedFiles.push('.hgtags');

	let xpiWriter;
	try {
		let chromeDir = directory.clone();
		chromeDir.append('chrome');

		let xpiFile = directory.clone();
		xpiFile.append(directory.leafName + '-' + version + '.xpi');
		xpiWriter = Cc['@mozilla.org/zipwriter;1'].createInstance(Ci.nsIZipWriter);
		xpiWriter.open(xpiFile, 0x02 | 0x08 | 0x20);
		xpiAddDirectory(directory, false, xpiWriter);

		for (let i = 0; i < listOfFiles.length; i++) {
			log('Not found: ' + listOfFiles[i], 'main-error');
		}

		checkLocales();
	} catch (e) {
		Cu.reportError(e);
	} finally {
		xpiWriter.close();
	}

	return true;
}

function xpiAddDirectory(directory, wildcard, zipWriter) {
	let dirRelativePath = directory.path.substring(dirPathLength).replace(/\\/g, '/');

	let files = [];
	let entries = directory.directoryEntries;
	while (entries.hasMoreElements()) {
		files.push(entries.getNext().QueryInterface(Ci.nsIFile));
	}
	files.sort(sortFiles);
	for (let i = 0; i < files.length; i++) {
		let file = files[i];
		let relativePath = file.path.substring(dirPathLength).replace(/\\/g, '/');

		if (listOfExcludedFiles.indexOf(relativePath) >= 0) {
			log('Excluded: ' + relativePath, 'main-notadded');
			continue;
		}
		if (!file.isDirectory() && listOfExcludedFiles.some(function(excludedFile) {
			if (excludedFile.indexOf('*.') == 0) {
				let extension = excludedFile.substring(1);
				let index = relativePath.indexOf(extension);
				return index >= 0 && index + extension.length == relativePath.length;
			}
			return false;
		})) {
			log('Excluded: ' + relativePath, 'main-notadded');
			continue;
		}

		if (file.isDirectory()) {
			if (hasListOfFiles) {
				let index = listOfFiles.indexOf(relativePath);
				let wildcardIndex = listOfFiles.indexOf(relativePath + '/*');
				if (!wildcard && index < 0 && wildcardIndex < 0) {
					log('Not added: ' + relativePath, 'main-notadded');
					continue;
				}
				if (index >= 0) {
					listOfFiles.splice(index, 1);
					wildcardIndex = listOfFiles.indexOf(relativePath + '/*');
				}
				if (wildcardIndex >= 0) {
					log(relativePath + ' (wildcard)', 'main-added');
					listOfFiles.splice(wildcardIndex, 1);
				} else {
					log(relativePath, 'main-added');
				}
				zipWriter.addEntryDirectory(relativePath, file.lastModifiedTime * 1000, false);
				xpiAddDirectory(file, wildcard || wildcardIndex >= 0, zipWriter);
			} else {
				if (!zipWriter.hasEntry(relativePath)) {
					log(relativePath, 'main-added');
					zipWriter.addEntryDirectory(relativePath, file.lastModifiedTime * 1000, false);
				}
				xpiAddDirectory(file, wildcard, zipWriter);
			}
			continue;
		}

		if (!amoPropertiesFiles && /amo\.properties$/i.test(relativePath)) {
			log('Not added: ' + relativePath, 'main-notadded');
			continue;
		}

		if (!wildcard && hasListOfFiles) {
			let index = listOfFiles.indexOf(relativePath);
			if (index < 0) {
				log('Not added: ' + relativePath, 'main-notadded');
				continue;
			}
			listOfFiles.splice(index, 1);
		}

		if (/\.(properties|dtd)$/.test(relativePath)) {
			if (typeof locales[directory.leafName] == 'undefined') {
				locales[directory.leafName] = [];
			}
			locales[directory.leafName].push(file);
		}

		log(relativePath, 'main-added');
		zipWriter.addEntryFile(relativePath, Ci.nsIZipWriter.COMPRESSION_DEFAULT, file, false);
	}
}

function sortFiles(aFile, bFile) {
	let aName = aFile.leafName.toLowerCase();
	let bName = bFile.leafName.toLowerCase();
	if (aName == bName)
		return 0;
	return aName < bName ? -1 : 1;
}

function checkLocales() {

	if (!locales['en-US']) {
		return;
	}

	for (let l in locales) {
		let files = {};
		for (let i = 0; i < locales[l].length; i++) {
			let file = locales[l][i];
			let strings = {};
			if (/\.properties/.test(file.leafName)) {
				doPropertiesFile(file, strings);
			} else {
				doDtdFile(file, strings);
			}
			files[file.leafName] = strings;
		}
		localeObj[l] = files;
	}

	for (let l in localeObj) {
		if (l == 'en-US')
			continue;

		for (let f in localeObj['en-US']) {
			if (!localeObj[l][f]) {
				log(f + ' in ' + l + ' is missing', 'main-error');
				continue;
			}
			let yes = 0, equal = 0, no = 0;
			for (let s in localeObj['en-US'][f]) {
				let enString = localeObj['en-US'][f][s];
				let lString = localeObj[l][f][s];
				if (typeof lString == 'undefined') {
					no++;
				} else if (lString == enString) {
					equal++;
				} else {
					yes++;
				}
			}
			let d = document.getElementById(l + '/' + f);
			if (d) {
				let s = document.createElement('span');
				if (no > 0) {
					s.className = 'no';
					s.appendChild(document.createTextNode(no));
				} else if (equal > 0) {
					s.className = 'equal';
					s.appendChild(document.createTextNode(equal));
				} else {
					s.className = 'yes';
					s.appendChild(document.createTextNode(yes));
				}
				d.appendChild(s);
			}
		}
	}
}

function doPropertiesFile(file, strings) {
	let leafName = file.leafName;
	let lines = readFileLines(file);
	for (let i = 0, iCount = lines.length; i < iCount; i++) {
		let realLine = lines[i].replace(/#.*$/, '');
		let m = realLine.match(/^([\w\.-]+)\s*=\s*(.*)$/);
		if (m) {
			strings[m[1]] = m[2];
		}
	}
}

function doDtdFile(file, strings) {
	let leafName = file.leafName;
	let lines = readFileLines(file);
	for (let i = 0, iCount = lines.length; i < iCount; i++) {
		let realLine = lines[i].replace(/<!--.*$/, '');
		let m = realLine.match(/ENTITY\s+([\w\.-]+)\s+"(.*)"/);
		if (m) {
			strings[m[1]] = m[2];
		}
	}
}

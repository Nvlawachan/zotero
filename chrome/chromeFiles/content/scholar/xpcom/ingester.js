// Firefox Scholar Ingester
// Utilities based on code taken from Piggy Bank 2.1.1 (BSD-licensed)
// This code is licensed according to the GPL

Scholar.Ingester = new function() {}

/////////////////////////////////////////////////////////////////
//
// Scholar.Ingester.Model
//
/////////////////////////////////////////////////////////////////

// Scholar.Ingester.Model, an object representing an RDF data model with
// methods to add to that model. In Piggy Bank, this was implemented in Java,
// but seeing as we don't really want an enormous web server running with FS,
// but we don't actually need that, so it's much simpler.
// 
// The Java version of this class can be viewed at
// http://simile.mit.edu/repository/piggy-bank/trunk/src/java/edu/mit/simile/piggyBank/WorkingModel.java
Scholar.Ingester.Model = function() {
	this.data = new Object();
}

// Piggy Bank provides a fourth argument, one that determines if the third
// argument is a literal or an RDF URI. Since our ontologies are
// sufficiently restricted, we have no chance of confusing a literal and an
// RDF URI and thus this is unnecessary.
Scholar.Ingester.Model.prototype.addStatement = function(uri, rdfUri, literal) {
	if(!this.data[uri]) this.data[uri] = new Object();
	this.data[uri][rdfUri] = literal;
	Scholar.debug(rdfUri+" for "+uri+" is "+literal);
}

// Additional functions added for compatibility purposes only
// No idea if any scraper actually uses these, but just in case, they're
// implemented so as not to throw an exception
Scholar.Ingester.Model.prototype.addTag = function() {}
Scholar.Ingester.Model.prototype.getRepository = function() {}
Scholar.Ingester.Model.prototype.detachRepository = function() {}

/////////////////////////////////////////////////////////////////
//
// Scholar.Ingester.Utilities
//
/////////////////////////////////////////////////////////////////
// Scholar.Ingester.Utilities class, a set of methods to assist in data
// extraction. Most code here was stolen directly from the Piggy Bank project.
Scholar.Ingester.Utilities = function() {}

// Adapter for Piggy Bank function to print debug messages; log level is
// fixed at 4 (could change this)
Scholar.Ingester.Utilities.prototype.debugPrint = function(msg) {
	Scholar.debug(msg, 4);
}

// Appears to trim a string, chopping of newlines/spacing
Scholar.Ingester.Utilities.prototype.trimString = function(s) {
	var i = 0;
	var spaceChars = " \n\r\t" + String.fromCharCode(160) /* &nbsp; */;
	while (i < s.length) {
		var c = s.charAt(i);
		if (spaceChars.indexOf(c) < 0) {
			break;
		}
		i++;
	}
	
	s = s.substring(i);
	
	i = s.length;
	while (i > 0) {
		var c = s.charAt(i - 1);
		if (spaceChars.indexOf(c) < 0) {
			break;
		}
		i--;
	}
	
	return s.substring(0, i);
}

// Takes an XPath query and returns the results
Scholar.Ingester.Utilities.prototype.gatherElementsOnXPath = function(doc, parentNode, xpath, nsResolver) {
	var elmts = [];
	
	var iterator = doc.evaluate(xpath, parentNode, nsResolver, Components.interfaces.nsIDOMXPathResult.ANY_TYPE,null);
	var elmt = iterator.iterateNext();
	var i = 0;
	while (elmt) {
		elmts[i++] = elmt;
		elmt = iterator.iterateNext();
	}
	return elmts;
}

// Loads a single document for a scraper, running succeeded() on success or
// failed() on failure
Scholar.Ingester.Utilities.prototype.loadDocument = function(url, browser, succeeded, failed) {
	this.processDocuments(browser, null, [ url ], succeeded, function() {}, failed);
}

// Downloads and processes documents with processor()
// browser - a browser object
// firstDoc - the first document to process with the processor (if null, 
//            first document is processed without processor)
// urls - an array of URLs to load
// processor - a function to execute to process each document
// done - a function to execute when all document processing is complete
// exception - a function to execute if an exception occurs (exceptions are
//             also logged in the Firefox Scholar log)
Scholar.Ingester.Utilities.prototype.processDocuments = function(browser, firstDoc, urls, processor, done, exception) {
	try {
		if (urls.length == 0) {
			if (firstDoc) {
				processor(firstDoc, done);
			} else {
				done();
			}
			return;
		}
		
		var urlIndex = -1;
		var doLoad = function() {
			urlIndex++;
			if (urlIndex < urls.length) {
				try {
					var url = urls[urlIndex];
					var b = Scholar.Ingester.progressDialog.document.getElementById("hidden-browser");
					b.loadURI(url);
				} catch (e) {
					exception(e);
					Scholar.debug("Scholar.Ingester.Utilities.processDocuments doLoad: " + e, 2);
				}
			} else {
				window.setTimeout(done, 10);
			}
		};
		var onLoad = function() {
			try {
				var b = Scholar.Ingester.progressDialog.document.getElementById("hidden-browser").selectedBrowser;
				processor(b.contentDocument, doLoad);
			} catch (e) {
				exception(e);
				Scholar.debug("Scholar.Ingester.Utilities.processDocuments onLoad: " + e, 2);
			}
		};
		var init = function() {
			var listener;
			listener.onStateChange = function(webProgress, request, stateFlags, status) {
				if ((stateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP) > 0 &&
					request.name == urls[urlIndex]) {
					try {
						Scholar.Ingester.progressDialog.setTimeout(onLoad, 10);
					} catch (e) {
						exception(e);
						Scholar.debug("Scholar.Ingester.Utilities.processDocuments onLocationChange: " + e, 2);
					}
				}
			};
			
			var tb = Scholar.Ingester.progressDialog.document.getElementById("hidden-browser");
			tb.addProgressListener(listener, Components.interfaces.nsIWebProgress.NOTIFY_STATUS);
			
			if (firstDoc) {
				processor(firstDoc, doLoad);
			} else {
				doLoad();
			}
		}
		
		w.addEventListener("load", init, false);
	} catch (e) {
		exception(e);
		PB_Debug.print("processDocuments: " + e);
	}
}

// Appears to look for links in a document containing a certain substring
Scholar.Ingester.Utilities.prototype.collectURLsWithSubstring = function(doc, substring) {
	var urls = [];
	var addedURLs = [];
	
	var aElements = doc.evaluate("//a", doc, null, Components.interfaces.nsIDOMXPathResult.ANY_TYPE,null);
	var aElement = aElements.iterateNext();
	while (aElement) {
		var href = aElement.href;
		if (href.indexOf(substring) >= 0 && !(addedURLs[href])) {
			urls.unshift(href);
			addedURLs[href] = true;
		}
		aElement = aElements.iterateNext();
	}
	return urls;
}

// For now, we're going to skip the getLLsFromAddresses function (which gets
// latitude and longitude pairs from a series of addresses, but requires the
// big mess of Java code that is the Piggy Bank server) and the geoHelper
// tools (which rely on getLLsFromAddresses) since these are probably not
// essential components for Scholar and would take a great deal of effort to
// implement. We can, however, always implement them later.

// It looks like these are simple front-ends for XMLHttpRequest. They're a
// component of the Piggy Bank API, so they're implemented here.
Scholar.Ingester.Utilities.HTTPUtilities = function() {}

Scholar.Ingester.Utilities.HTTPUtilities.prototype.doGet = function(url, onStatus, onDone) {
   var xmlhttp = new XMLHttpRequest();
   
   xmlhttp.open('GET', url, true);
   xmlhttp.overrideMimeType("text/xml");
   xmlhttp.onreadystatechange = function() {
	  Scholar.Ingester.Utilities.HTTPUtilities.stateChange(xmlhttp, onStatus, onDone);
   };
   xmlhttp.send(null);
}

Scholar.Ingester.Utilities.HTTPUtilities.prototype.doPost = function(url, body, onStatus, onDone) {
   var xmlhttp = new XMLHttpRequest();
   
   xmlhttp.open('POST', url, true);
   xmlhttp.overrideMimeType("text/xml");
   xmlhttp.onreadystatechange = function() {
	  Scholar.Ingester.Utilities.HTTPUtilities.stateChange(xmlhttp, onStatus, onDone);
   };
   xmlhttp.send(body);
}
	
Scholar.Ingester.Utilities.HTTPUtilities.prototype.doOptions = function(url, body, onStatus, onDone) {
   var xmlhttp = new XMLHttpRequest();
   
   xmlhttp.open('OPTIONS', url, true);
   xmlhttp.overrideMimeType("text/xml");
   xmlhttp.onreadystatechange = function() {
	  Scholar.Ingester.Utilities.HTTPUtilities.stateChange(xmlhttp, onStatus, onDone);
   };
   xmlhttp.send(body);
}
	
// Possible point of failure; for some reason, this used to be a separate
// class, so make sure it works
Scholar.Ingester.Utilities.HTTPUtilities.prototype.stateChange = function(xmlhttp, onStatus, onDone) {
	switch (xmlhttp.readyState) {

		// Request not yet made
		case 1:
		break;

		// Contact established with server but nothing downloaded yet
		case 2:
			try {
				// Check for HTTP status 200
				if (xmlhttp.status != 200) {
					if (onStatus) {
						onStatus(
							xmlhttp.status,
							xmlhttp.statusText,
							xmlhttp
						);
						xmlhttp.abort();
					}
				}
			} catch (e) {
				Scholar.debug(e, 2);
			}
		break;

		// Called multiple while downloading in progress
		case 3:
		break;

		// Download complete
		case 4:
			try {
				if (onDone) {
					onDone(xmlhttp.responseText, xmlhttp);
				}
			} catch (e) {
				Scholar.debug(e, 2);
			}
		break;
	}
}
//////////////////////////////////////////////////////////////////////////////
//
// Scholar.Ingester.Document
//
//////////////////////////////////////////////////////////////////////////////

/* Public properties:
 * browser - browser window object of document
 * model - data model for semantic scrapers
 * scraper - best scraper to use to scrape page
 *
 * Private properties:
 * _sandbox - sandbox for code execution
 */

//////////////////////////////////////////////////////////////////////////////
//
// Public Scholar.Ingester.Document methods
//
//////////////////////////////////////////////////////////////////////////////

/*
 * Constructor for Document object
 */
Scholar.Ingester.Document = function(browserWindow){
	this.browser = browserWindow;
	this.scraper = null
	this.model = new Scholar.Ingester.Model();
	this._generateSandbox();
}

/*
 * Retrieves the best scraper to scrape a given page
 */
Scholar.Ingester.Document.prototype.retrieveScraper = function() {
	Scholar.debug("Retrieving scrapers for "+this.browser.contentDocument.location.href);
	var sql = 'SELECT * FROM scrapers ORDER BY scraperDetectCode IS NULL DESC';
	var scrapers = Scholar.DB.query(sql);
	for(var i=0; i<scrapers.length; i++) {
		var currentScraper = scrapers[i];
		if(this.canScrape(currentScraper)) {
			this.scraper = currentScraper;
			Scholar.debug("Found scraper "+this.scraper.label);
			return true;
		}
	}
	return false;
}

/*
 * Check to see if _scraper_ can scrape this document
 */
Scholar.Ingester.Document.prototype.canScrape = function(currentScraper) {
		var canScrape = false;
	
	// Test with regular expression
	// If this is slow, we could preload all scrapers and compile regular
	// expressions, so each check will be faster
	if(currentScraper.urlPattern) {
		var regularExpression = new RegExp(currentScraper.urlPattern, "i");
		if(regularExpression.test(this.browser.contentDocument.location.href)) {
			canScrape = true;
		}
	}
	
	// Test with JavaScript if available and didn't have a regular expression or
	// passed regular expression test
	if((!currentScraper.urlPattern || canScrape)
	  && currentScraper.scraperDetectCode) {
		var scraperSandbox = this.sandbox;
		try {
			canScrape = this.evalInSandbox("(function(){\n" +
							   currentScraper.scraperDetectCode +
							   "\n})()", scraperSandbox);
		} catch(e) {
			throw e+' in scraperDetectCode for '+currentScraper.label;
		}
	}
	return canScrape;
}

/*
 * Populate model with semantic data regarding this page using _scraper_
 * Callback will be executed once scraping is complete
 */
Scholar.Ingester.Document.prototype.scrapePage = function(callback) {
	if(callback) {
		this._scrapeCallback = callback;
	}
	
	Scholar.debug("Scraping "+this.browser.contentDocument.location.href);
	
	var scraperSandbox = this.sandbox;
	
	try {
		Components.utils.evalInSandbox(this.scraper.scraperJavaScript, scraperSandbox);
	} catch(e) {
		throw e+' in scraperJavaScript for '+this.scraper.label;
	}
	
	// If synchronous, call _scrapePageComplete();
	if(!scraperSandbox._waitForCompletion) {
		this._scrapePageComplete();
	}
}

//////////////////////////////////////////////////////////////////////////////
//
// Private Scholar.Ingester.Document methods
//
//////////////////////////////////////////////////////////////////////////////

/*
 * Piggy Bank/FS offers four objects to JavaScript scrapers
 * browser - the object representing the open browser window containing the
 *           document to be processes
 * doc - the DOM (basically just browser.contentDocument)
 * model - the object representing the RDF model of data to be returned
 *         (see Scholar.Ingester.Model)
 * utilities - a set of utilities for making certain tasks easier
 *             (see Scholar.Ingester.Utilities);
 *
 * Piggy Bank/FS also offers two functions to simplify asynchronous requests
 * (these will only be available for scraping, and not for scrape detection)
 * wait() - called on asynchronous requests so that Piggy Bank/FS will not
 *          automatically return at the end of code execution
 * done() - when wait() is called, Piggy Bank/FS will wait for this
 *          function before returning
 */

/*`
 * Called when scraping (synchronous or asynchronous) is complete
 */
Scholar.Ingester.Document.prototype._scrapePageComplete = function() {
	this._updateDatabase();
	if(this._scrapeCallback) {
		this._scrapeCallback(this);
	}
}
 
Scholar.Ingester.Document.prototype._generateSandbox = function() {
	this.sandbox = new Components.utils.Sandbox(this.browser.contentDocument.location.href);
	this.sandbox.browser = this.browser;
	this.sandbox.doc = this.sandbox.browser.contentDocument;
	this.sandbox.utilities = new Scholar.Ingester.Utilities;
	this.sandbox.model = this.model;
	this.sandbox.XPathResult = Components.interfaces.nsIDOMXPathResult;
	
	this.sandbox.wait = function(){ this._waitForCompletion = true; };
	this.sandbox.done = function(){ this._scrapePageComplete(); };
}

/*
 * Add data ingested using RDF to database
 * (Ontologies are hard-coded until we have a real way of dealing with them)
 */
Scholar.Ingester.Document.prototype._updateDatabase = function() {
	var prefixRDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
	var prefixDC = 'http://purl.org/dc/elements/1.1/';
	var prefixDCMI = 'http://purl.org/dc/dcmitype/';
	var prefixDummy = 'http://chnm.gmu.edu/firefox-scholar/';
	
	for(var uri in this.model.data) {
		var newItem = Scholar.Items.getNewItemByType(1);
		newItem.setField("source", uri);
		if(this.model.data[uri][prefixDC + 'title']) {
			newItem.setField("title", this.model.data[uri][prefixDC + 'title']);
		}
		if(this.model.data[uri][prefixDC + 'publisher']) {
			newItem.setField("publisher", this.model.data[uri][prefixDC + 'publisher']);
		}
		if(this.model.data[uri][prefixDC + 'year']) {
			data.date = this.model.data[uri][prefixDC + 'year'].substring(
						 this.model.data[uri][prefixDC + 'year'].lastIndexOf(" ")+1,
						 this.model.data[uri][prefixDC + 'year'].length);
		}
		if(this.model.data[uri][prefixDC + 'edition']) {
			newItem.setField("edition", this.model.data[uri][prefixDC + 'edition']);
		}
		if(this.model.data[uri][prefixDC + 'identifier']) {
			newItem.setField("ISBN", this.model.data[uri][prefixDC + 'identifier'].substring(5));
		}
		if(this.model.data[uri][prefixDC + 'creator']) {
			var creator = this.model.data[uri][prefixDC + 'creator'];
			
			var spaceIndex = creator.lastIndexOf(" ");
			var lastName = creator.substring(spaceIndex+1, creator.length);
			var firstName = creator.substring(0, spaceIndex);
			
			newItem.setCreator(0, firstName, lastName);
		}
		newItem.save();
		
		// First one is stored so as to be accessible
		if(!this.item) {
			this.item = newItem;
		}
	}
}
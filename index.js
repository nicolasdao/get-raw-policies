#!/usr/bin/env node

const { exec } = require('child_process')
const { utils: { throttle } } = require('core-async')
const { extname, resolve } = require('path')
const fs = require('fs')
const cliProgress = require('cli-progress')

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

const silent = process.argv && process.argv.some(x => x == '--silent')
const filename = process.argv ? process.argv.reduce((acc,a) => {
	if (a == '--save')
		acc.save = true
	else if (a && extname(a) && acc.save)
		acc.f = resolve(a)
	else if (acc.save)
		acc.save = false
	return acc
}, { save:false }).f : null
const concurrency = process.argv ? process.argv.reduce((acc,a) => {
	if (a == '--concurrency')
		acc.concurrency = true
	else if (!isNaN(a*1) && acc.concurrency)
		acc.c = a*1 > 0 ? a*1 : 1
	else if (acc.concurrency)
		acc.concurrency = false
	return acc
}, { concurrency:false }).c||10 : 10

const printSuccess = msg => silent ? null : console.log(`\x1b[1m\x1b[32m✔ ${msg}\x1b[0m`)
const printInfo = msg => silent ? null : console.log(`\x1b[1m\x1b[36mi ${msg}\x1b[0m`)
const printError = msg => silent ? null : console.log(`\x1b[1m\x1b[31mx ${msg}\x1b[0m`)

/**
 * Creates file or update file located under 'filePath'. 
 * 
 * @param  {String}  filePath 			Absolute file path on the local machine
 * @param  {Object}  content 			File content
 * @param  {Boolean} options.append 	Default false. If true, this function appends rather than overrides.
 * @param  {String}  options.appendSep 	Default '\n'. That the string used to separate appended content. This option is only
 *                                     	active when 'options.append' is set to true.
 * @return {Void}                	
 */
const writeToFile = (filePath, content, options) => new Promise((onSuccess, onFailure) => {
	filePath = resolve(filePath||'')
	content = content || ''
	const { append, appendSep='\n' } = options || {}
	const stringContent = (typeof(content) == 'string' || content instanceof Buffer) ? content : JSON.stringify(content, null, '	')
	const fn = append ? fs.appendFile : fs.writeFile
	fn(filePath, append ? `${stringContent}${appendSep}` : stringContent, err => err ? onFailure(err) : onSuccess())
})

const getAWSManagedPolicies = () => new Promise((next, fail) => {
	printInfo(`Listing all AWS managed policies...`)
	exec('aws iam list-policies --scope AWS', (err, stdout, stderr) => {
		if (err)
			fail(err)
		else if (stdout)
			next(stdout)
		else if (stderr)
			fail(stderr)
		else
			next(stdout)
	})
})

//aws iam get-policy-version --policy-arn arn:aws:iam::aws:policy/AWSDirectConnectReadOnlyAccess --version-id v3
const getPolicyDocument = (arn, versionId) => new Promise((next, fail) => {
	exec(`aws iam get-policy-version --policy-arn ${arn} --version-id ${versionId}`, (err, stdout) => {
		if (err) {
			printError(`Failed to get ARN ${arn}. ${err.message}`)
			fail(err)
		} else if (stdout)
			next(stdout)
		else
			next(stdout)
	})
})

const delay = t => new Promise(next => setTimeout(next, t))

const getRetry = (fn, retryCount=0) => async () => {
	for (let i=0;i<=retryCount;i++) {
		const data = await fn().catch(() => 'error')
		if (data == 'error') {
			await delay(2000 + Math.round(5000*Math.random()))
			printInfo(`Retrying (${1+i})...`)
		} else 
			return data
	}
	return 'error'
}

const getPolicyDocumentWithRetry = (arn, versionId) => getRetry(() => getPolicyDocument(arn, versionId), 3)()

const getFullPolicy = async policy => {
	const doc = await getPolicyDocumentWithRetry(policy.Arn, policy.DefaultVersionId)
	if (doc == 'error')
		printError(`Failed to get policy ${policy.PolicyName} even after 3 attempts. Skipping it.`)
	else {
		try {
			const { PolicyVersion } = JSON.parse(doc)
			policy.Document = PolicyVersion.Document
			policy.VersionId = PolicyVersion.VersionId
			return policy
		} catch(err) {
			printError(`Failed to parse policy ${policy.PolicyName} to JSON.`)	
			printError(doc)
		}
	}
}

const main = async () => {
	const policies = JSON.parse(await getAWSManagedPolicies()).Policies
	const policyDocumentTasks = []

	let counter = 1
	for (let i=0;i<policies.length;i++) {
		const policy = policies[i]
		if (policy.Arn && policy.DefaultVersionId)
			policyDocumentTasks.push(async () => {
				const result = await getFullPolicy(policy)
				progressBar.update(counter++)
				return result
			})
	}

	const total = policyDocumentTasks.length
	printInfo(`Found ${total} AWS managed policies. Extracting their details...`)
	progressBar.start(total,0)
	const resolvedPolicies = await throttle(policyDocumentTasks, concurrency)
	progressBar.stop()

	const validPolicies = resolvedPolicies.filter(x => x)
	const succeeded = validPolicies.length
	printSuccess(`${succeeded} out of ${total} policies were successfully resolved`)

	const finalDocument = validPolicies.sort((a,b) => a.PolicyName < b.PolicyName ? -1 : 1).reduce((acc,p) => {
		acc[p.PolicyName] = p
		return acc
	}, {})

	if (filename) {
		await writeToFile(filename, finalDocument)
		printSuccess(`${succeeded} policies successfully saved to ${filename}`)
	} else
		console.log(JSON.stringify(finalDocument,null, '	'))
}

main()
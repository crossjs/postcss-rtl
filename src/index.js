const postcss = require( 'postcss' )

const affectedProps = require( './affected-props' )
const { validateOptions } = require( './options' )
const { isKeyframeRule, isKeyframeAlreadyProcessed, isKeyframeSymmetric, rtlifyKeyframe } = require( './keyframes' )
const { getDirRule, processSrcRule } = require( './rules' )
const { rtlifyDecl, ltrifyDecl } = require( './decls' )
const { isSelectorHasDir } = require( './selectors' )

let __keyframes = []

module.exports = postcss.plugin( 'postcss-rtl', ( options ) => css => {

    let keyframes = []

    options = validateOptions( options )

    const handleIgnores = ( removeComments = false ) => {
        let isIgnored = false
        let continuousIgnore = false

        return ( node ) => {
            if ( node.type === 'comment' ) {
                switch ( node.text ) {
                    case 'rtl:ignore':
                        isIgnored = true
                        continuousIgnore = continuousIgnore || false
                        removeComments && node.remove()
                        break
                    case 'rtl:begin:ignore':
                        isIgnored = true
                        continuousIgnore = true
                        removeComments && node.remove()
                        break
                    case 'rtl:end:ignore':
                        isIgnored = false
                        continuousIgnore = false
                        removeComments && node.remove()
                        break
                }
                return true
            }
            if ( !continuousIgnore && isIgnored ) {
                isIgnored = false
                return true
            }
            return isIgnored
        }
    }

    const isKeyframeIgnored = handleIgnores()
    const isRuleIgnored = handleIgnores( true )

    // collect @keyframes
    css.walk( rule => {

        if ( isKeyframeIgnored( rule ) ) return
        if ( rule.type !== 'atrule' ) return

        if ( !isKeyframeRule( rule ) ) return
        if ( isKeyframeAlreadyProcessed( rule ) ) return
        if ( isKeyframeSymmetric( rule ) ) return

        keyframes.push( rule.params )
        rtlifyKeyframe( rule )
    } )

    if ( keyframes.length ) {
        __keyframes = __keyframes.concat( keyframes )
    } else {
        keyframes = __keyframes
    }

    // Simple rules (includes rules inside @media-queries)
    css.walk( node => {
        let ltrDecls = []
        let rtlDecls = []
        let dirDecls = []

        if ( isRuleIgnored( node ) ) return

        if ( node.type !== 'rule' ) {
            return
        }
        const rule = node

        if ( isSelectorHasDir( rule.selector, options ) ) return
        if ( isKeyframeRule( rule.parent ) ) return

        rule.walkDecls( decl => {
            const rtl = rtlifyDecl( decl, keyframes )

            if ( rtl ) {
                ltrDecls.push( ltrifyDecl( decl, keyframes ) )
                rtlDecls.push( decl.clone( rtl ) )
                return
            }

            if ( affectedProps.indexOf( decl.prop ) >= 0 ) {
                dirDecls.push( decl )
                decl.remove()
            }
        } )

        if ( rtlDecls.length ) {
            let ltrDirRule
            getDirRule( rule, 'rtl', options ).append( rtlDecls )
            ltrDirRule = getDirRule( rule, 'ltr', options )
            ltrDecls.forEach( _decl => {
                _decl.cleanRaws( _decl.root() === ltrDirRule.root() )
                rule.removeChild( _decl )
                ltrDirRule.append( _decl )
            })
        }

        if ( dirDecls.length ) {
            getDirRule( rule, 'dir', options ).append( dirDecls )
        }

        /* set dir attrs */
        processSrcRule( rule, options )
    } )
    return false
} )
